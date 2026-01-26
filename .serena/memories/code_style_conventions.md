# Code Style & Conventions

## Python (API & CLI)

### General
- Python 3.11+ required
- Use `ruff` for linting and formatting
- Use `mypy` with strict mode for type checking
- Line length: 100 characters

### Type Hints
- Required on all function signatures
- Use modern syntax: `list[str]` not `List[str]`
- Use `X | None` not `Optional[X]`
- Use `dict[str, Any]` for dynamic dicts

### Imports
- Sorted by `ruff` (isort rules)
- First-party imports: `from src.xxx import yyy`

### Docstrings
- Use Google-style docstrings
- Required for public APIs
- Include Args, Returns, Raises sections

### Async
- API uses async throughout
- Use `async def` for database/IO operations
- SQLAlchemy async session pattern

### Example Style
```python
from typing import Any

from src.models.db import EvalCaseModel


async def process_case(
    case: EvalCaseModel,
    config: dict[str, Any] | None = None,
) -> ScorerResult:
    """Process an evaluation case.

    Args:
        case: The evaluation case to process
        config: Optional configuration

    Returns:
        ScorerResult with score and reasoning
    """
    ...
```

## TypeScript/React (Frontend)

### General
- TypeScript strict mode
- Next.js 14 App Router
- TailwindCSS for styling

### Components
- Function components only
- Use `clsx` + `tailwind-merge` for class names
- Prefer composition over prop drilling

### State
- React Query for server state
- React hooks for local state

### Naming
- PascalCase for components
- camelCase for functions/variables
- kebab-case for file names

## Ruff Configuration

```toml
[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "C4", "SIM"]
ignore = ["E501"]
```

## Mypy Configuration

```toml
[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_ignores = true
```
