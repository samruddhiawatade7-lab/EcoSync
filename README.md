# ⚡ EcoSync — SmartGrid Energy Monitoring & Billing

[![FastAPI](https://img.shields.io/badge/FastAPI-2.0.0-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-7.6-231F20?logo=apache-kafka)](https://kafka.apache.org)
[![Spark](https://img.shields.io/badge/Apache_Spark-3.5-E25A1C?logo=apache-spark)](https://spark.apache.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose_v2-2496ED?logo=docker)](https://www.docker.com)

**EcoSync** is an enterprise-grade Smart Grid telemetry and billing SaaS platform. It combines a real-time **Lambda architecture** (streaming speed layer + batch billing reconciliation) with an **energy-utility dashboard** for grid operators and consumers.

---

## 🚀 Key Features

* **Energy Overview:** Anchored by featured KPI metrics, renewable contribution donut, 2-hourly graded load curves, peak demand detection, and live data telemetry status.
* **Real-time Monitoring:** Multi-dimensional filters (zone, household, meter ID, validity), with auto-refreshing readings and server-side pagination.
* **Solar Microgeneration:** PV generation curve tracking, clear separation between *generated* vs. *exported* solar energy, and net grid estimations.
* **Billing & Settlement:** Deterministic billing settlement (`consumption_kwh × rate_lkr_per_kwh`), invoice detail modal, one-click CSV export, and print-ready statements.
* **Dynamic Grid Registry:** Dynamic discovery of households and zones (`Z1`, `Z2`, `Z3`) with load curves and historical consumption drilldowns.
* **Pipeline Observability:** Real-time health probes for Kafka, Spark Streaming, PostgreSQL, and FastAPI with Dead-Letter Queue (DLQ) inspection.

---

## 🏗️ Architecture

```
[ Smart Meters Simulator ]
           │
           ▼
[ Apache Kafka ] ──► (topic: meter-readings)
           │
           ▼
[ Spark Structured Streaming ] ──► Validates, de-duplicates & aggregates 2h windows
           │
           ▼
[ PostgreSQL ] ◄── [ Airflow Batch DAG ] (daily tariff reconciliation)
           ▲
           │ (REST / JSON)
[ FastAPI Backend ]
           ▲
           │ (HTTP / React Router)
[ EcoSync React Web App ] (Port 8000 / 5173)
```

---

## ⚡ Quick Start

### 1. Standalone / Local Run (Fastest)

Clone and run the unified application directly (operates in dual-mode with live database or built-in realistic simulation):

```bash
# Clone the repository
git clone https://github.com/samruddhiawatade7-lab/EcoSync.git
cd EcoSync

# Install backend dependencies & start server
pip install -r requirements/app.txt
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

* Open the dashboard at **[http://localhost:8000](http://localhost:8000)**.
* For frontend hot-reloading development:
  ```bash
  cd frontend
  npm install
  npm run dev -- --port 5173
  ```

---

### 2. Full Docker Pipeline

To run the complete streaming infrastructure (PostgreSQL, Kafka, Spark Streaming, Airflow, FastAPI & Frontend):

```bash
cp .env.example .env
docker compose up -d --build
```

---

## 🌐 Service Ports & Endpoints

| Service | Port | URL / Description |
|---|---|---|
| **EcoSync Web Dashboard** | `8000` / `5173` | [http://localhost:8000](http://localhost:8000) (Unified) · [http://localhost:5173](http://localhost:5173) (Dev) |
| **FastAPI Swagger Docs** | `8000` | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **Pipeline Health Probes** | `8000` | [http://localhost:8000/health](http://localhost:8000/health) · `/metrics` |
| **Airflow Batch Console** | `8080` | [http://localhost:8080](http://localhost:8080) (`admin` / `admin`) |
| **Streamlit Ops Console** | `8501` | [http://localhost:8501](http://localhost:8501) |
| **PostgreSQL Database** | `5433` | Host port mapped to internal `5432` |
| **Apache Kafka Broker** | `29092` | Internal listener on `9092` |

---

## 🛠️ Technology Stack

* **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Recharts, Lucide Icons.
* **Backend:** FastAPI, Pydantic, Uvicorn, Python 3.11+.
* **Stream Processing:** Apache Spark 3.5 Structured Streaming (watermarking, deduplication, tumbling windows).
* **Message Broker:** Apache Kafka (partitioned by `household_id`).
* **Database & Storage:** PostgreSQL 16 (TimescaleDB compatible schema).
* **Orchestration & Workflow:** Apache Airflow 2.8.
* **Testing:** Pytest (unit, billing calculation, alert rules, API schemas, and idempotency tests).

---

## 🧪 Testing

Run the automated test suite:

```bash
python -m pytest tests/
```

All 32 unit and API endpoint contract tests validate billing precision, deduplication logic, health statuses, and SLA thresholds.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
