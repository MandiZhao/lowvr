"""
FastAPI backend for WandB Local Viewer.
"""
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import orjson

from .run_loader import RunLoader


# Initialize app
app = FastAPI(
    title="WandB Local Viewer",
    description="Local viewer for wandb experiment logs",
    version="1.0.0",
)

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global run loader - will be initialized with wandb directory
_run_loader: RunLoader | None = None


def get_run_loader() -> RunLoader:
    global _run_loader
    if _run_loader is None:
        raise HTTPException(500, "Run loader not initialized")
    return _run_loader


def init_run_loader(wandb_dir: str | Path):
    global _run_loader
    _run_loader = RunLoader(wandb_dir)


# Helper to make dict JSON-serializable (convert non-string keys)
def make_serializable(obj):
    if isinstance(obj, dict):
        return {str(k): make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_serializable(item) for item in obj]
    elif isinstance(obj, (int, float, str, bool, type(None))):
        return obj
    else:
        return str(obj)


# Custom JSON response using orjson for better performance
class ORJSONResponse(Response):
    media_type = "application/json"
    
    def render(self, content) -> bytes:
        serializable = make_serializable(content)
        return orjson.dumps(serializable, option=orjson.OPT_SERIALIZE_NUMPY)


# ============ API Routes ============

@app.get("/api/runs", response_class=ORJSONResponse)
async def list_runs():
    """List all discovered runs with metadata."""
    loader = get_run_loader()
    runs = loader.discover_runs()
    
    # Return run info including config for filtering
    return [{
        'id': r['id'],
        'display_name': r['display_name'],
        'created_at': r['created_at'],
        'is_offline': r['is_offline'],
        'has_videos': r['has_videos'],
        'state': r['metadata'].get('state') if r['metadata'] else None,
        'metadata': {
            'host': r['metadata'].get('host') if r['metadata'] else None,
            'gpu': r['metadata'].get('gpu') if r['metadata'] else None,
            'args': r['metadata'].get('args') if r['metadata'] else None,
            'program': r['metadata'].get('program') if r['metadata'] else None,
        },
        'config': r['config'],  # Include full config for filtering
    } for r in runs]


@app.get("/api/runs/{run_id}", response_class=ORJSONResponse)
async def get_run(run_id: str):
    """Get full details for a specific run."""
    loader = get_run_loader()
    run = loader.get_run(run_id)
    
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    
    return run


@app.get("/api/runs/{run_id}/metrics", response_class=ORJSONResponse)
async def get_run_metrics(
    run_id: str,
    keys: Annotated[list[str] | None, Query()] = None,
):
    """
    Get time series metrics for a run.
    
    Args:
        run_id: Run identifier
        keys: List of metric keys to return (None = all numeric metrics)
    """
    loader = get_run_loader()
    run = loader.get_run(run_id)
    
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    
    metrics = loader.get_run_metrics(run_id, keys)
    # Debug: log metric extraction
    if metrics:
        sample_key = list(metrics.keys())[0] if metrics else None
        if sample_key:
            print(f"Metrics for {run_id} (display: {run.get('display_name', 'N/A')}): {len(metrics)} keys, {len(metrics[sample_key])} data points for '{sample_key}'")
    return metrics


@app.get("/api/runs/{run_id}/available-metrics", response_class=ORJSONResponse)
async def get_available_metrics(run_id: str):
    """Get list of available metric keys for a run."""
    loader = get_run_loader()
    metrics = loader.get_available_metrics(run_id)
    return metrics


@app.get("/api/runs/{run_id}/videos", response_class=ORJSONResponse)
async def get_run_videos(run_id: str):
    """Get list of video/gif files for a run."""
    loader = get_run_loader()
    videos = loader.get_run_videos(run_id)
    return videos


@app.get("/api/media/{run_id}/{path:path}")
async def serve_media(run_id: str, path: str):
    """Serve media files (videos, gifs) for a run."""
    loader = get_run_loader()
    run = loader.get_run(run_id)
    
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    
    # Construct full path
    run_dir = Path(run['dir'])
    media_path = run_dir / 'files' / path
    
    if not media_path.exists():
        raise HTTPException(404, f"Media file not found: {path}")
    
    # Determine content type
    suffix = media_path.suffix.lower()
    content_type = {
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
    }.get(suffix, 'application/octet-stream')
    
    return FileResponse(media_path, media_type=content_type)


@app.post("/api/refresh")
async def refresh_runs():
    """Refresh the run cache."""
    loader = get_run_loader()
    loader.clear_cache()
    runs = loader.discover_runs()
    return {"message": "Cache refreshed", "run_count": len(runs)}


@app.get("/api/config-keys", response_class=ORJSONResponse)
async def get_config_keys():
    """Get all unique config keys across all runs."""
    loader = get_run_loader()
    # Make sure runs are discovered first
    loader.discover_runs()
    keys = loader.get_all_config_keys()
    return keys


# ============ Run Set Management (stored client-side, but API for future) ============

class RunSet(BaseModel):
    id: str
    name: str
    run_ids: list[str]
    color: str | None = None


# In-memory run sets (could persist to JSON file)
_run_sets: dict[str, RunSet] = {}


@app.get("/api/run-sets", response_class=ORJSONResponse)
async def list_run_sets():
    """List all run sets."""
    return list(_run_sets.values())


@app.post("/api/run-sets", response_class=ORJSONResponse)
async def create_run_set(run_set: RunSet):
    """Create or update a run set."""
    _run_sets[run_set.id] = run_set
    return run_set


@app.delete("/api/run-sets/{set_id}")
async def delete_run_set(set_id: str):
    """Delete a run set."""
    if set_id in _run_sets:
        del _run_sets[set_id]
        return {"message": "Deleted"}
    raise HTTPException(404, "Run set not found")


@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str):
    """Delete a run folder entirely."""
    import shutil
    
    loader = get_run_loader()
    run = loader.get_run(run_id)
    
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    
    run_dir = Path(run['dir'])
    
    if not run_dir.exists():
        raise HTTPException(404, f"Run directory not found: {run_dir}")
    
    try:
        # Delete the entire run folder
        shutil.rmtree(run_dir)
        # Clear cache so the run is removed from listings
        loader.clear_cache()
        return {"message": f"Run {run_id} deleted successfully", "path": str(run_dir)}
    except Exception as e:
        raise HTTPException(500, f"Failed to delete run: {str(e)}")


@app.post("/api/runs/{run_id}/stop")
async def stop_run(run_id: str):
    """
    Stop a running run by sending SIGTERM to its process.
    
    This finds the process by matching the run's unique identifier (display name or args)
    in the command line, then sends a graceful termination signal.
    """
    import signal
    import subprocess
    
    loader = get_run_loader()
    run = loader.get_run(run_id)
    
    if not run:
        raise HTTPException(404, f"Run {run_id} not found")
    
    metadata = run.get('metadata')
    if not metadata:
        raise HTTPException(400, f"Run {run_id} has no metadata")
    
    # Check if run state indicates it's running
    state = metadata.get('state', '')
    if state != 'running':
        raise HTTPException(400, f"Run is not in 'running' state (state: {state})")
    
    program = metadata.get('program')
    if not program:
        raise HTTPException(400, f"Run {run_id} has no program path in metadata")
    
    # Get the script name for filtering
    script_name = Path(program).name
    
    # Build unique identifiers to find THIS specific run (not all runs of the same script)
    # Priority: display_name > unique args > script + run_id
    unique_patterns = []
    
    # 1. The display name is usually the experiment name, which appears in -exp argument
    display_name = run.get('display_name', '')
    if display_name and display_name != run_id and len(display_name) > 5:
        unique_patterns.append(display_name)
    
    # 2. Try to find a unique arg like -exp or -clip that identifies this run
    args = metadata.get('args', [])
    for i, arg in enumerate(args):
        # Look for experiment name arguments
        if arg in ['-exp', '--exp', '-experiment', '--experiment', '-name', '--name']:
            if i + 1 < len(args):
                unique_patterns.append(args[i + 1])
        # Also check for clip/task identifiers
        elif arg in ['-clip', '--clip']:
            if i + 1 < len(args):
                unique_patterns.append(args[i + 1])
    
    # 3. As fallback, combine script name with run_id
    unique_patterns.append(f"{script_name}.*{run_id}")
    
    pids = set()
    matched_pattern = None
    
    for pattern in unique_patterns:
        try:
            # Use pgrep to find processes matching this pattern
            # -f matches against full command line
            result = subprocess.run(
                ['pgrep', '-f', pattern],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0 and result.stdout.strip():
                found_pids = [int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()]
                if found_pids:
                    pids.update(found_pids)
                    matched_pattern = pattern
                    break  # Found a match, stop searching
        except Exception:
            continue
    
    if not pids:
        # Last resort: show the user what patterns we tried
        raise HTTPException(
            404, 
            f"No running process found. Tried matching: {unique_patterns[:3]}. "
            f"The process may have already finished."
        )
    
    # Send SIGTERM to each process (graceful termination)
    stopped_pids = []
    failed_pids = []
    
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            stopped_pids.append(pid)
        except ProcessLookupError:
            # Process already terminated
            pass
        except PermissionError:
            failed_pids.append(pid)
    
    if failed_pids and not stopped_pids:
        raise HTTPException(403, f"Permission denied to stop process(es): {failed_pids}")
    
    # Clear cache to refresh run state
    loader.clear_cache()
    
    return {
        "message": f"Sent SIGTERM to stop run {run_id}",
        "stopped_pids": stopped_pids,
        "failed_pids": failed_pids,
        "matched_pattern": matched_pattern,
    }
