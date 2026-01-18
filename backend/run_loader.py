"""
Load and manage wandb runs from a directory.
"""
import json
import yaml
from pathlib import Path
from typing import Any
from datetime import datetime
import re

from .datastore_reader import read_wandb_file, extract_metrics_from_history


class RunLoader:
    """Load and cache wandb runs from a directory."""
    
    def __init__(self, wandb_dir: str | Path):
        self.wandb_dir = Path(wandb_dir)
        self._runs_cache: dict[str, dict] = {}
        self._history_cache: dict[str, dict[str, Any]] = {}
        self._binary_data_cache: dict[str, dict] = {}
    
    def discover_runs(self) -> list[dict]:
        """
        Discover all runs in the wandb directory.
        
        Returns:
            List of run metadata dicts
        """
        runs = []
        
        # Pattern: run-YYYYMMDD_HHMMSS-runid or offline-run-YYYYMMDD_HHMMSS-runid
        run_pattern = re.compile(r'^(offline-)?run-(\d{8}_\d{6})-([a-z0-9]+)$')
        
        for run_dir in self.wandb_dir.iterdir():
            if not run_dir.is_dir():
                continue
            
            match = run_pattern.match(run_dir.name)
            if not match:
                continue
            
            is_offline = match.group(1) is not None
            timestamp_str = match.group(2)
            run_id = match.group(3)
            
            # Parse timestamp
            try:
                created_at = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
            except ValueError:
                created_at = None
            
            # Find .wandb file
            wandb_files = list(run_dir.glob('run-*.wandb'))
            if not wandb_files:
                continue
            
            wandb_file = str(wandb_files[0])
            
            # Load metadata from files
            metadata = self._load_metadata(run_dir)
            config = self._load_config(run_dir)
            summary = self._load_summary(run_dir)
            
            # For offline runs (or if config missing), try to get from binary file
            binary_run_info = None
            binary_data = self._get_binary_data(run_id, wandb_file)
            if binary_data:
                # Binary config from run record has full config (like wandb sync uses)
                binary_config = binary_data.get('config')
                if binary_config:
                    # Use binary config - it has the complete config
                    if config is None or not config:
                        config = binary_config
                    else:
                        # Merge binary config into existing (binary has more complete data)
                        for key, value in binary_config.items():
                            if key not in config:
                                config[key] = value
                if summary is None:
                    summary = binary_data.get('summary')
                binary_run_info = binary_data.get('run_info')
            
            # If still no config, build from command-line args as last resort
            if not config:
                config = self._build_config_from_args(metadata)
            
            run_info = {
                'id': run_id,
                'dir': str(run_dir),
                'wandb_file': wandb_file,
                'is_offline': is_offline,
                'created_at': created_at.isoformat() if created_at else None,
                'name': metadata.get('program', '').split('/')[-1] if metadata else run_id,
                'display_name': self._get_display_name(run_id, config, metadata, binary_run_info),
                'metadata': metadata,
                'config': config,
                'summary': summary,
                'media_dir': str(run_dir / 'files' / 'media'),
                'has_videos': self._has_videos(run_dir),
            }
            
            runs.append(run_info)
            self._runs_cache[run_id] = run_info
        
        # Sort by creation time (newest first)
        runs.sort(key=lambda x: x['created_at'] or '', reverse=True)
        return runs
    
    def _get_binary_data(self, run_id: str, wandb_file: str) -> dict | None:
        """Get config/summary from binary .wandb file (cached)."""
        if run_id in self._binary_data_cache:
            return self._binary_data_cache[run_id]
        
        try:
            data = read_wandb_file(wandb_file)
            result = {
                'config': data.get('config'),
                'summary': data.get('summary'),
                'run_info': data.get('run_info'),
            }
            self._binary_data_cache[run_id] = result
            return result
        except Exception as e:
            print(f"Error reading binary data for {run_id}: {e}")
            return None
    
    def _load_metadata(self, run_dir: Path) -> dict | None:
        """Load wandb-metadata.json"""
        metadata_file = run_dir / 'files' / 'wandb-metadata.json'
        if metadata_file.exists():
            try:
                return json.loads(metadata_file.read_text())
            except Exception:
                pass
        return None
    
    def _load_config(self, run_dir: Path) -> dict | None:
        """Load config.yaml"""
        config_file = run_dir / 'files' / 'config.yaml'
        if config_file.exists():
            try:
                config = yaml.safe_load(config_file.read_text())
                # Flatten wandb config format
                flattened = {}
                for key, value in config.items():
                    if isinstance(value, dict) and 'value' in value:
                        flattened[key] = value['value']
                    else:
                        flattened[key] = value
                return flattened
            except Exception:
                pass
        return None
    
    def _load_summary(self, run_dir: Path) -> dict | None:
        """Load wandb-summary.json"""
        summary_file = run_dir / 'files' / 'wandb-summary.json'
        if summary_file.exists():
            try:
                return json.loads(summary_file.read_text())
            except Exception:
                pass
        return None
    
    def _build_config_from_args(self, metadata: dict | None) -> dict:
        """Build a nested config dict from command-line args."""
        if not metadata:
            return {}
        
        args = metadata.get('args', [])
        if not args:
            return {}
        
        config = {}
        for arg in args:
            if '=' not in arg:
                continue
            key_path, value = arg.split('=', 1)
            
            # Parse value
            try:
                # Try to parse as number or bool
                if value.lower() == 'true':
                    parsed_value = True
                elif value.lower() == 'false':
                    parsed_value = False
                elif '.' in value:
                    parsed_value = float(value)
                else:
                    parsed_value = int(value)
            except ValueError:
                parsed_value = value
            
            # Build nested dict
            # Convert key like 'task.rew_cfg.obj_dist_weight' to nested structure
            parts = key_path.split('.')
            current = config
            for i, part in enumerate(parts[:-1]):
                if part not in current:
                    current[part] = {}
                elif not isinstance(current[part], dict):
                    # If the part already exists as a non-dict value, we can't nest
                    # Skip nested structure and use flat key instead
                    config[key_path] = parsed_value
                    break
                current = current[part]
            else:
                # Only set the value if we didn't break (nested structure was successful)
                current[parts[-1]] = parsed_value
        
        return config

    def _get_display_name(self, run_id: str, config: dict | None, metadata: dict | None, binary_run_info: dict | None = None) -> str:
        """Extract a display name from config, binary run_info, metadata, or use run_id."""
        # First priority: display_name from binary run_info (most reliable for offline runs)
        if binary_run_info:
            name = binary_run_info.get('display_name')
            if name and name != run_id:
                return name
        
        # Second priority: config
        if config:
            # Try common name fields in config
            params = config.get('params', {})
            if isinstance(params, dict):
                cfg = params.get('config', {})
                if isinstance(cfg, dict):
                    name = cfg.get('full_experiment_name')
                    if name:
                        return name
            
            # Try env_kwargs path
            env_kwargs = config.get('env_kwargs', {})
            if isinstance(env_kwargs, dict):
                retarget = env_kwargs.get('retarget_info', {})
                if isinstance(retarget, dict):
                    clip = retarget.get('clip')
                    if clip:
                        return clip
        
        return run_id
    
    def _has_videos(self, run_dir: Path) -> bool:
        """Check if run has video/gif files."""
        media_dir = run_dir / 'files' / 'media'
        if media_dir.exists():
            return any(media_dir.rglob('*.gif')) or any(media_dir.rglob('*.mp4'))
        return False
    
    def get_run(self, run_id: str) -> dict | None:
        """Get a specific run by ID."""
        if run_id in self._runs_cache:
            return self._runs_cache[run_id]
        
        # Re-discover if not in cache
        self.discover_runs()
        return self._runs_cache.get(run_id)
    
    def get_run_history(self, run_id: str, force_reload: bool = False) -> list[dict]:
        """
        Get the full history (time series) for a run.
        This reads the .wandb binary file.
        """
        run = self.get_run(run_id)
        if not run:
            return []
        
        wandb_file = run.get('wandb_file')
        if not wandb_file or not Path(wandb_file).exists():
            return []

        wandb_path = Path(wandb_file)
        mtime = wandb_path.stat().st_mtime
        cached = self._history_cache.get(run_id)
        if cached and not force_reload and cached.get('mtime') == mtime:
            return cached.get('history', [])
        
        try:
            data = read_wandb_file(wandb_file)
            history = data.get('history', [])
            if not history:
                print(f"Warning: No history found in wandb file for {run_id}: {wandb_file}")
            else:
                print(f"Loaded {len(history)} history rows for {run_id} (display_name: {run.get('display_name', 'N/A')})")
            self._history_cache[run_id] = {'history': history, 'mtime': mtime}
            return history
        except Exception as e:
            print(f"Error reading history for {run_id}: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_run_metrics(
        self, 
        run_id: str, 
        metric_keys: list[str] | None = None
    ) -> dict[str, list]:
        """
        Get specific metrics from a run's history in columnar format.
        """
        history = self.get_run_history(run_id)
        if not history:
            print(f"Warning: No history for {run_id} when getting metrics")
            return {}
        metrics = extract_metrics_from_history(history, metric_keys)
        return metrics
    
    def get_available_metrics(self, run_id: str) -> list[str]:
        """Get list of available numeric metrics for a run."""
        history = self.get_run_history(run_id)
        if not history:
            print(f"No history available for {run_id}")
            return []
        
        metrics = set()
        # Check more rows to catch metrics that appear later, or all rows if less than 100
        sample_size = min(100, len(history))
        for row in history[:sample_size]:
            for key, value in row.items():
                # Include numeric values, excluding internal wandb keys
                # But allow some common metric patterns that start with letters/numbers
                if isinstance(value, (int, float)):
                    # Exclude internal wandb keys like _step, _timestamp, _runtime
                    # But include metrics that might have underscores in the middle
                    if not key.startswith('_') or key in ['_step', '_timestamp', '_runtime']:
                        metrics.add(key)
        
        # If we didn't find many metrics, try checking all rows
        if len(metrics) < 3 and len(history) > sample_size:
            for row in history:
                for key, value in row.items():
                    if isinstance(value, (int, float)) and not key.startswith('_'):
                        metrics.add(key)
        
        result = sorted(metrics)
        if not result:
            print(f"Warning: No metrics found in history for {run_id}. History has {len(history)} rows.")
            if history:
                print(f"Sample row keys: {list(history[0].keys())[:10]}")
        
        return result
    
    def get_run_videos(self, run_id: str) -> list[dict]:
        """Get list of video/gif files for a run."""
        run = self.get_run(run_id)
        if not run:
            return []
        
        videos = []
        media_dir = Path(run['media_dir'])
        
        if media_dir.exists():
            for gif_file in sorted(media_dir.rglob('*.gif')):
                # Extract epoch from filename like epoch40_4_hash.gif
                name = gif_file.stem
                epoch_match = re.search(r'epoch(\d+)', name)
                epoch = int(epoch_match.group(1)) if epoch_match else None
                
                videos.append({
                    'path': str(gif_file),
                    'filename': gif_file.name,
                    'name': name,
                    'epoch': epoch,
                    'relative_path': str(gif_file.relative_to(Path(run['dir']) / 'files')),
                })
        
        # Sort by epoch
        videos.sort(key=lambda x: x['epoch'] if x['epoch'] is not None else float('inf'))
        return videos
    
    def get_all_config_keys(self) -> list[str]:
        """Get all unique config keys across all runs (flattened)."""
        all_keys = set()
        
        for run_id, run in self._runs_cache.items():
            config = run.get('config')
            if config:
                self._flatten_keys(config, '', all_keys)
        
        return sorted(
            key
            for key in all_keys
            if not key.startswith('_wandb') and not key.startswith('wandb_version')
        )
    
    def _flatten_keys(self, obj: Any, prefix: str, keys: set):
        """Recursively flatten nested dict keys."""
        if isinstance(obj, dict):
            for key, value in obj.items():
                full_key = f"{prefix}.{key}" if prefix else key
                if isinstance(value, dict):
                    self._flatten_keys(value, full_key, keys)
                else:
                    keys.add(full_key)
    
    def get_config_value(self, config: dict, key_path: str) -> Any:
        """Get a nested config value by dot-separated path."""
        parts = key_path.split('.')
        current = config
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current
    
    def clear_cache(self):
        """Clear all caches."""
        self._runs_cache.clear()
        self._history_cache.clear()
        self._binary_data_cache.clear()
