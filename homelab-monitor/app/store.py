"""Histórico de métricas em SQLite (uma tabela, amostras ts/key/value)."""
import os
import sqlite3
import threading
import time

RANGES = {"1h": 3600, "6h": 6 * 3600, "24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400}


class Store:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("CREATE TABLE IF NOT EXISTS samples (ts INTEGER, key TEXT, value REAL)")
            self.db.execute("CREATE INDEX IF NOT EXISTS ix_key_ts ON samples(key, ts)")
            self.db.commit()

    def write(self, metrics, ts=None):
        ts = int(ts or time.time())
        rows = [(ts, k, float(v)) for k, v in metrics.items() if isinstance(v, (int, float))]
        if rows:
            with self.lock:
                self.db.executemany("INSERT INTO samples VALUES (?,?,?)", rows)
                self.db.commit()

    def prune(self, days):
        with self.lock:
            self.db.execute("DELETE FROM samples WHERE ts < ?", (int(time.time() - days * 86400),))
            self.db.commit()

    def series(self, keys, rng="6h", points=240):
        span = RANGES.get(rng, 6 * 3600)
        since = int(time.time() - span)
        bucket = max(30, span // points)
        out = {}
        with self.lock:
            for k in keys:
                cur = self.db.execute(
                    "SELECT (ts/?)*? AS b, AVG(value) FROM samples WHERE key=? AND ts>=? GROUP BY b ORDER BY b",
                    (bucket, bucket, k, since))
                out[k] = [[r[0], round(r[1], 2)] for r in cur.fetchall()]
        return dict(range=rng, bucket=bucket, since=since, series=out)

    def energy_kwh(self, key, seconds, max_gap=900):
        """Integra watts no tempo (regra do trapézio entre amostras) → kWh.
        Vale para qualquer intervalo de coleta; lacunas maiores que max_gap (servidor
        desligado) não entram na conta. Devolve (kWh, segundos cobertos)."""
        since = int(time.time() - seconds)
        with self.lock:
            rows = self.db.execute("SELECT ts, value FROM samples WHERE key=? AND ts>=? ORDER BY ts", (key, since)).fetchall()
        wh, covered = 0.0, 0
        for (t0, v0), (t1, v1) in zip(rows, rows[1:]):
            dt = t1 - t0
            if 0 < dt <= max_gap:
                wh += (v0 + v1) / 2 * dt / 3600
                covered += dt
        return round(wh / 1000, 3), covered
