"""Cronjob 2 (Practica 5, requisito H).

Se ejecuta cada 10 minutos: lee los registros que dejo el Cronjob 1
(heartbeat) en "cronjob_ejecuciones" (platform_db), calcula la cantidad de
ejecuciones por hora, y publica ese resumen como un mensaje en el broker
(topico "cronjob-resumen"). notificaciones-service lo consume y lo almacena
en "cronjob_resumenes" (ver
notificaciones-service/src/infrastructure/kafka/CronjobResumenConsumer.ts).
"""

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2
from kafka import KafkaProducer


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def calcular_resumen_por_hora(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT date_trunc('hour', ejecutado_en) AS hora, count(*) AS cantidad
            FROM cronjob_ejecuciones
            GROUP BY hora
            ORDER BY hora
            """
        )
        return [{"hora": hora.isoformat(), "cantidad": cantidad} for hora, cantidad in cur.fetchall()]


def main() -> None:
    conn = psycopg2.connect(
        host=required_env("DB_HOST"),
        port=required_env("DB_PORT"),
        user=required_env("DB_USER"),
        password=required_env("DB_PASSWORD"),
        dbname=required_env("PLATFORM_DB_NAME"),
    )
    try:
        resumen_por_hora = calcular_resumen_por_hora(conn)
    finally:
        conn.close()

    mensaje = {
        "generadoEn": datetime.now(timezone.utc).isoformat(),
        "carne": required_env("CARNE"),
        "resumenPorHora": resumen_por_hora,
    }

    brokers = required_env("KAFKA_BROKERS").split(",")
    topic = required_env("KAFKA_CRONJOB_RESUMEN_TOPIC")

    producer = KafkaProducer(
        bootstrap_servers=brokers,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    try:
        future = producer.send(topic, mensaje)
        future.get(timeout=15)  # espera la confirmacion del broker antes de salir
        producer.flush()
    finally:
        producer.close()

    print(f"[cronjob-resumen] publicado en '{topic}': {len(resumen_por_hora)} horas resumidas")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001 - error de nivel de proceso, se reporta y se sale con codigo != 0
        print(f"[cronjob-resumen] fallo la ejecucion: {err}", file=sys.stderr)
        sys.exit(1)
