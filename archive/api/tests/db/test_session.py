"""Tests for database session management."""


import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker


class TestSessionModule:
    """Tests for session module structure."""

    def test_engine_is_async_engine(self) -> None:
        """Test that the engine is an AsyncEngine."""
        from src.db.session import engine

        assert isinstance(engine, AsyncEngine)

    def test_session_factory_is_async_sessionmaker(self) -> None:
        """Test that the session factory is an async_sessionmaker."""
        from src.db.session import async_session_factory

        assert isinstance(async_session_factory, async_sessionmaker)

    def test_session_factory_uses_async_session(self) -> None:
        """Test that the session factory creates AsyncSession instances."""
        from src.db.session import async_session_factory

        # Check the class_ parameter
        assert async_session_factory.class_ is AsyncSession

    def test_session_factory_expire_on_commit_false(self) -> None:
        """Test that sessions don't expire on commit for better async support."""
        from src.db.session import async_session_factory

        # expire_on_commit should be False for async sessions
        assert async_session_factory.kw.get("expire_on_commit") is False


class TestGetDbStructure:
    """Tests for get_db function structure."""

    def test_get_db_is_async_generator(self) -> None:
        """Test that get_db is an async generator function."""
        import inspect

        from src.db.session import get_db

        assert inspect.isasyncgenfunction(get_db)

    @pytest.mark.asyncio
    async def test_get_db_returns_async_generator(self) -> None:
        """Test that calling get_db returns an async generator."""
        import inspect

        from src.db.session import get_db

        result = get_db()
        assert inspect.isasyncgen(result)
        # Clean up properly
        await result.aclose()


class TestInitDb:
    """Tests for init_db function."""

    def test_init_db_is_async_function(self) -> None:
        """Test that init_db is an async function."""
        import inspect

        from src.db.session import init_db

        assert inspect.iscoroutinefunction(init_db)


class TestEngineConfiguration:
    """Tests for engine configuration."""

    def test_engine_uses_asyncpg_driver(self) -> None:
        """Test that the engine uses asyncpg driver for PostgreSQL."""
        from src.db.session import engine

        # Check the driver name
        assert engine.dialect.driver == "asyncpg"

    def test_engine_url_host_matches_settings(self) -> None:
        """Test that the engine URL host matches settings."""
        from src.config import settings
        from src.db.session import engine

        # Extract host from both URLs for comparison (avoiding password masking issues)
        settings_url = settings.database_url
        # Parse the host from the settings URL
        import re
        settings_host_match = re.search(r"@([^:/]+)", settings_url)
        engine_host = engine.url.host

        assert settings_host_match is not None
        assert engine_host == settings_host_match.group(1)

    def test_engine_url_database_matches_settings(self) -> None:
        """Test that the engine URL database matches settings."""
        # Extract database name from settings URL
        import re

        from src.config import settings
        from src.db.session import engine
        settings_db_match = re.search(r"/([^/?]+)(?:\?|$)", settings.database_url)
        engine_db = engine.url.database

        assert settings_db_match is not None
        assert engine_db == settings_db_match.group(1)

    def test_engine_is_not_none(self) -> None:
        """Test that the engine was created successfully."""
        from src.db.session import engine

        assert engine is not None


class TestBaseImport:
    """Tests for Base model import."""

    def test_base_imported_from_models(self) -> None:
        """Test that Base is properly imported from models."""
        from src.db.session import Base
        from src.models.db import Base as ModelsBase

        assert Base is ModelsBase
