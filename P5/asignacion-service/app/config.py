import os

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class Settings:
    PORT: int = int(os.environ.get("PORT", "8000"))
    DB_HOST: str = _required("DB_HOST")
    DB_PORT: int = int(_required("DB_PORT"))
    DB_USER: str = _required("DB_USER")
    DB_PASSWORD: str = _required("DB_PASSWORD")
    DB_NAME: str = _required("DB_NAME")
    INTERNAL_SERVICE_SECRET: str = _required("INTERNAL_SERVICE_SECRET")


settings = Settings()
