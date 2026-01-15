#!/usr/bin/env python3
"""
WandB Local Viewer - Launch Script

Usage:
    python run.py /path/to/wandb/directory [--port 8765]

Then access at http://localhost:8765 (or forward the port from your server)
"""
import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Launch WandB Local Viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Basic usage
    python run.py /path/to/project/wandb
    
    # Custom port
    python run.py /path/to/project/wandb --port 9000
    
    # Then on your local machine, forward the port:
    ssh -L 8765:localhost:8765 user@server
    
    # And open http://localhost:8765 in your browser
        """
    )
    parser.add_argument(
        "wandb_dir",
        type=str,
        help="Path to wandb directory containing run folders"
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8765,
        help="Port to run the server on (default: 8765)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    
    args = parser.parse_args()
    
    # Validate wandb directory
    wandb_dir = Path(args.wandb_dir).resolve()
    if not wandb_dir.exists():
        print(f"Error: Directory does not exist: {wandb_dir}")
        sys.exit(1)
    
    if not wandb_dir.is_dir():
        print(f"Error: Not a directory: {wandb_dir}")
        sys.exit(1)
    
    # Check for run directories
    run_dirs = list(wandb_dir.glob("*run-*"))
    if not run_dirs:
        print(f"Warning: No run directories found in {wandb_dir}")
        print("Expected directories matching pattern: run-* or offline-run-*")
    else:
        print(f"Found {len(run_dirs)} run directories")
    
    # Import and configure the app
    import uvicorn
    from backend.api import app, init_run_loader
    from fastapi.staticfiles import StaticFiles
    
    # Initialize the run loader with the wandb directory
    init_run_loader(wandb_dir)
    
    # Mount static files for frontend
    frontend_dist = Path(__file__).parent / "frontend" / "dist"
    if frontend_dist.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
        print(f"Serving frontend from {frontend_dist}")
    else:
        print(f"Note: Frontend not built. Run 'cd frontend && npm run build' first.")
        print(f"API will still be available at http://{args.host}:{args.port}/api/")
    
    print(f"\n{'='*60}")
    print(f"  WandB Local Viewer")
    print(f"  Serving runs from: {wandb_dir}")
    print(f"  Access at: http://localhost:{args.port}")
    print(f"{'='*60}\n")
    print(f"For remote access, forward the port:")
    print(f"  ssh -L {args.port}:localhost:{args.port} user@server\n")
    
    # Run the server
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
