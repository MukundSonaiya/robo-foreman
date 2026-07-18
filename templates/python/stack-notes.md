# Python (FastAPI / Django) notes

- Prefer type hints on public functions.
- FastAPI: keep routers thin; put business logic in services.
- Django: follow app layout already in the repo; never invent a second settings module.
- Use the detected installer (`uv` / `poetry` / `pip`) — never mix.
