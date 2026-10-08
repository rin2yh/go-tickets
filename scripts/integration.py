#!/usr/bin/env python3
"""Exercise real local Wrangler D1 through both Workers (capacity=1 seed data)."""
import concurrent.futures
import json
import threading
import urllib.error
import urllib.request
import uuid

PUBLIC = "public.local"
ADMIN = "admin.local"


def request(base, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request("http://127.0.0.1:8787" + path, data=data, headers={"Content-Type": "application/json", "Host": base})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def register(user):
    return request(PUBLIC, "/registrations", {"ticket_type_id": 1, "user_id": user})


def cancel(user):
    return request(PUBLIC, "/registrations/cancel", {"ticket_type_id": 1, "user_id": user})


def status():
    code, data = request(ADMIN, "/ticket-types/1/status")
    assert code == 200, (code, data)
    return data


def race(users):
    barrier = threading.Barrier(len(users))

    def run(user):
        barrier.wait()
        return user, register(user)

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(users)) as pool:
        return list(pool.map(run, users))


def main():
    run_id = uuid.uuid4().hex[:12]
    same_user = f"same-{run_id}"
    racing_user = f"racing-{run_id}"
    assert request(PUBLIC, "/health")[0] == 200
    assert request(ADMIN, "/health")[0] == 200
    assert status()["capacity"] == 1
    assert status()["reserved"] == 0, "run on a fresh local D1 database"

    distinct = race([f"distinct-{run_id}-{n}" for n in range(100)])
    winners = [user for user, (code, _) in distinct if code == 201]
    assert len(winners) == 1, distinct
    assert all(code in (201, 409) for _, (code, _) in distinct), distinct
    assert status()["reserved"] == 1
    assert cancel(winners[0])[0] == 200
    assert status()["reserved"] == 0
    print("100 distinct simultaneous registrations: 1 success, 99 conflicts")

    same = race([same_user] * 100)
    assert sum(code == 201 for _, (code, _) in same) == 1, same
    assert all(code in (201, 409) for _, (code, _) in same), same
    assert status()["reserved"] == 1
    assert register(same_user)[1]["error"] == "duplicate_registration"
    print("100 simultaneous duplicate requests: 1 success, 99 conflicts")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        cancellation = pool.submit(cancel, same_user)
        registration = pool.submit(register, racing_user)
        assert cancellation.result()[0] == 200
        reg_code, reg_body = registration.result()
    assert reg_code in (201, 409), (reg_code, reg_body)
    assert status()["reserved"] in (0, 1)
    if reg_code == 409:
        assert reg_body["error"] == "sold_out"
        assert register(racing_user)[0] == 201
    assert status()["reserved"] == 1
    assert cancel(racing_user)[0] == 200
    assert status()["reserved"] == 0
    print("cancel/register race: counter remained consistent and seat recovered")


if __name__ == "__main__":
    main()
