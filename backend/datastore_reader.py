"""
Read wandb .wandb binary log files using the official protobuf format.
"""
import json
from pathlib import Path
from typing import Any

from wandb.sdk.internal.datastore import DataStore
from wandb.proto import wandb_internal_pb2


def read_wandb_file(wandb_file_path: str | Path) -> dict[str, Any]:
    """
    Read a .wandb binary log file and extract all data.
    
    Returns:
        dict with keys: run_info, history, summary, config
    """
    ds = DataStore()
    ds.open_for_scan(str(wandb_file_path))
    
    run_info = {}
    history = []
    summary = {}
    config = {}
    
    count = 0
    while True:
        record_bytes = ds.scan_data()
        if record_bytes is None:
            break
        
        # Skip header record
        if count == 0:
            count += 1
            continue
        
        try:
            record = wandb_internal_pb2.Record()
            record.ParseFromString(record_bytes)
            record_type = record.WhichOneof('record_type')
            
            if record_type == 'run':
                run_info = {
                    'run_id': record.run.run_id,
                    'display_name': record.run.display_name,
                    'project': record.run.project,
                    'entity': record.run.entity,
                }
                # Extract config from run record (this is where wandb stores full config)
                if record.run.config and record.run.config.update:
                    for item in record.run.config.update:
                        try:
                            config[item.key] = json.loads(item.value_json)
                        except (json.JSONDecodeError, TypeError):
                            config[item.key] = item.value_json
                # Extract summary from run record if present
                if record.run.summary and record.run.summary.update:
                    for item in record.run.summary.update:
                        try:
                            summary[item.key] = json.loads(item.value_json)
                        except (json.JSONDecodeError, TypeError):
                            summary[item.key] = item.value_json
            elif record_type == 'history':
                row = {}
                for item in record.history.item:
                    try:
                        row[item.key] = json.loads(item.value_json)
                    except (json.JSONDecodeError, TypeError):
                        row[item.key] = item.value_json
                history.append(row)
            elif record_type == 'summary':
                for item in record.summary.update:
                    try:
                        summary[item.key] = json.loads(item.value_json)
                    except (json.JSONDecodeError, TypeError):
                        summary[item.key] = item.value_json
            elif record_type == 'config':
                # Also check standalone config records
                for item in record.config.update:
                    try:
                        config[item.key] = json.loads(item.value_json)
                    except (json.JSONDecodeError, TypeError):
                        config[item.key] = item.value_json
        except Exception:
            pass
        
        count += 1
    
    return {
        'run_info': run_info,
        'history': history,
        'summary': summary,
        'config': config,
    }


def extract_metrics_from_history(history: list[dict], metric_keys: list[str] | None = None) -> dict[str, list]:
    """
    Extract specific metrics from history into columnar format.
    
    Args:
        history: List of history row dicts
        metric_keys: List of metric keys to extract (None = all numeric)
    
    Returns:
        dict mapping metric_key -> list of values
    """
    if not history:
        return {}
    
    # Common x-axis keys to always include
    x_axis_keys = {'_step', 'iter', 'info/epochs', 'step', '_timestamp', '_runtime'}
    
    # If no keys specified, find all numeric keys
    if metric_keys is None:
        metric_keys = set()
        for row in history[:10]:  # Sample first 10 rows
            for key, value in row.items():
                if isinstance(value, (int, float)) and not key.startswith('_'):
                    metric_keys.add(key)
        metric_keys = sorted(metric_keys)
    
    # Ensure we include x-axis keys that exist in data
    all_keys = set(metric_keys) | x_axis_keys
    
    result = {key: [] for key in all_keys}
    result['_step'] = []  # Always include _step
    
    for row in history:
        result['_step'].append(row.get('_step', len(result['_step'])))
        for key in all_keys:
            if key == '_step':
                continue
            value = row.get(key)
            if isinstance(value, (int, float)):
                result[key].append(value)
            else:
                result[key].append(None)
    
    # Remove empty x-axis keys (all None values)
    keys_to_remove = []
    for key in x_axis_keys:
        if key in result and all(v is None for v in result[key]):
            keys_to_remove.append(key)
    for key in keys_to_remove:
        del result[key]
    
    return result
