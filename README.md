# <img src="./lowvr-2d.png" alt="lowvr logo" height="25" /> Lowvr  

A clean, minimal local viewer for WandB experiment logs. View and compare runs without uploading to the cloud.  


## Features

- 📊 **Line Plot Comparison** - Compare metrics across multiple runs side-by-side
- 🎬 **Video Gallery** - View training videos/GIFs with epoch navigation
- 🗂️ **Run Sets** - Group runs into named sets for easy comparison
- 🔍 **Search & Filter** - Filter runs by name, args, or online/offline status
- 🌙 **Dark Mode** - Easy on the eyes for long debugging sessions
- 🔒 **Fully Local** - All data stays on your machine

## Quick Start

### 1. Setup

```bash
cd lowvr
chmod +x setup.sh
./setup.sh
```

Or manually:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install and build frontend
cd frontend
npm install
npm run build
cd ..
```

### 2. Run

```bash
python run.py /path/to/your/wandb/directory
```

### 3. Access

For **local machines**, open: http://localhost:8765

For **remote/headless servers**, set up port forwarding:
```bash
# On your local machine:
ssh -L 8765:localhost:8765 user@server

# Then open http://localhost:8765 in your browser
```

## Usage

### Selecting Runs
- Click runs in the sidebar to select them for comparison
- Use the search box to filter by run ID, name, or command args
- Filter by online/offline status using the wifi icons

### Comparing Metrics
1. Select 2+ runs in the sidebar
2. Expand metric groups and check the metrics you want to plot
3. Charts will appear in the main panel

### Viewing Videos
1. Select runs that have videos (marked with "video" badge)
2. Switch to "Videos" or "Both" view mode using the header buttons
3. Use the epoch navigation to step through training progress
4. Videos are displayed side-by-side for easy comparison

### Run Sets
1. Select the runs you want to group
2. Enter a name in the "Run Sets" panel
3. Click + to save the set
4. Click a set name to restore that selection

## Project Structure

```
lowvr/
├── backend/
│   ├── api.py              # FastAPI endpoints
│   ├── datastore_reader.py # WandB protobuf parser
│   └── run_loader.py       # Run discovery & caching
├── frontend/
│   └── src/
│       ├── components/     # React components
│       ├── hooks/          # Data fetching hooks
│       └── stores/         # Zustand state
├── run.py                  # Launch script
├── setup.sh                # Setup script
└── requirements.txt        # Python dependencies
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/runs` | List all runs |
| `GET /api/runs/{id}` | Get run details |
| `GET /api/runs/{id}/metrics` | Get time series metrics |
| `GET /api/runs/{id}/videos` | Get video file list |
| `GET /api/media/{id}/{path}` | Serve media files |

## Configuration

```bash
# Custom port
python run.py /path/to/wandb --port 9000

# Bind to specific host
python run.py /path/to/wandb --host 127.0.0.1
```

## Requirements

- Python 3.10+
- Node.js 18+
- wandb (for protobuf parsing)

## License

MIT
