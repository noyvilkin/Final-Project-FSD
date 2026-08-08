import os

import psycopg2
from flask import Flask, jsonify, request

app = Flask(__name__)


def get_db():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        dbname=os.environ.get("DB_NAME", "tasks"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", "postgres"),
    )


# NOTE: intentionally no authentication middleware or JWT usage.
# Every /tasks endpoint below is completely unprotected.


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.get("/tasks")
def list_tasks():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, title, done FROM tasks ORDER BY id")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([{"id": r[0], "title": r[1], "done": r[2]} for r in rows])


@app.post("/tasks")
def create_task():
    data = request.get_json() or {}
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO tasks (title, done) VALUES (%s, %s) RETURNING id",
        (data.get("title"), False),
    )
    task_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(id=task_id, title=data.get("title"), done=False), 201


@app.put("/tasks/<int:task_id>")
def update_task(task_id):
    data = request.get_json() or {}
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE tasks SET title=%s, done=%s WHERE id=%s",
        (data.get("title"), data.get("done", False), task_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(id=task_id, title=data.get("title"), done=data.get("done", False))


@app.delete("/tasks/<int:task_id>")
def delete_task(task_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id=%s", (task_id,))
    conn.commit()
    cur.close()
    conn.close()
    return "", 204


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", "4000")))
