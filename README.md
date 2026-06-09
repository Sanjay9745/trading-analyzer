# Trading Analyzer & Analytics Platform

A real-time quantitative stock market analytics platform that performs pattern detection, signals conviction analysis, and showcases interactive visualization. The project consists of a FastAPI backend backed by MongoDB and a React + TypeScript + Vite frontend.

---

## 🚀 Key Features

*   **Quantitative Signal Engine**: Scans historical price data to identify chart patterns (such as Head & Shoulders) and evaluates buy/sell conviction metrics.
*   **Asynchronous Scanner**: Triggers background batch scans using `yfinance` to retrieve historical market data, governed by semaphores to prevent API rate limits.
*   **Real-time Mock Streaming**: A WebSocket endpoint (`/api/ws/ticker/{symbol}`) simulates live ticker price fluctuations.
*   **Interactive Charts**: Beautiful price overlays featuring EMA curves, pattern markers, and trade reports.
*   **Watchlist Management**: Add, remove, and query tickers from a personalized watchlist persisted in MongoDB.
*   **Stock Catalog Search**: Search and filter a built-in catalog of assets by symbol, name, exchange, or sector.

---

## 📂 Project Structure

```text
trading-analyzer/
├── backend/                # FastAPI application
│   ├── main.py             # Server entry point & CORS configuration
│   ├── routes.py           # API endpoints (REST & WebSockets)
│   ├── config.py           # Application settings & environment variables
│   ├── db.py               # MongoDB motor database adapter
│   ├── worker.py           # Batch scan tasks & yfinance fetching
│   ├── analyzer.py         # Quantitative analysis & pattern detection math
│   ├── stock_catalog.py    # Static asset reference list
│   └── Dockerfile          # Container specification
├── frontend/               # React + TS + Vite web application
│   ├── src/
│   │   ├── components/     # UI Components (Dashboard, Chart, StockBrowser)
│   │   └── App.tsx         # Main application coordinator
│   └── package.json
└── docker-compose.yml      # Orchestrates FastAPI & MongoDB
```

---

## 🐳 Running with Docker (Recommended)

You can spin up the database and the backend API using Docker Compose.

### Prerequisites
*   [Docker](https://www.docker.com/products/docker-desktop/) installed.

### Steps
1.  Navigate to the root directory of the project.
2.  Start the services:
    ```bash
    docker compose up --build
    ```
    This spins up two services:
    *   **mongodb**: Port `27017` (stored persistently in `mongo_data` volume)
    *   **backend**: Port `8000` (FastAPI app)

3.  The API documentation will be available at `http://localhost:8000/docs` (Swagger UI).

---

## 🛠️ Local Development Setup

If you prefer to run the applications directly on your machine without Docker:

### 1. Database Setup
Ensure you have a MongoDB instance running locally on the default port:
```text
mongodb://localhost:27017
```

### 2. Backend Setup
1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv .venv
    # On Windows:
    .venv\Scripts\activate
    # On macOS/Linux:
    source .venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Run the application:
    ```bash
    python main.py
    ```
    The server will start at `http://127.0.0.1:8000`.

### 3. Frontend Setup
1.  Navigate to the `frontend` directory:
    ```bash
    cd ../frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Start the Vite dev server:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

---

## 📡 API Reference Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | API Healthcheck / Root message |
| `/api/stocks/search` | `GET` | Search stock catalog (supports `q` and `exchange` filters) |
| `/api/scanner/run` | `POST` | Trigger background scanner for specific tickers or watchlist |
| `/api/scanner/report`| `GET` | Retrieve latest scan reports sorted by conviction rate |
| `/api/ticker/{symbol}`| `GET` | Fetch detailed analysis, EMA history, and patterns for a symbol |
| `/api/watchlist` | `GET` | Fetch the watchlist tickers |
| `/api/watchlist` | `POST` | Add a ticker to the watchlist |
| `/api/watchlist/{symbol}`| `DELETE`| Delete a ticker from the watchlist |
| `/api/ws/ticker/{symbol}`| `WS` | Real-time WebSocket connection streaming simulated live price data |
