# Task Completion Checklist

## Before Marking a Task Complete

### Code Quality
- [ ] Run `make lint` — no linting errors
- [ ] Run `make typecheck` — no type errors
- [ ] Run `make format` — code is formatted

### Testing
- [ ] Run `make test` — all tests pass
- [ ] Add tests for new functionality
- [ ] Test edge cases

### For API Changes
- [ ] Update Pydantic models if needed
- [ ] Update/create database migrations
- [ ] Test endpoints manually or with httpx

### For Frontend Changes
- [ ] Run `npm run lint` — no ESLint errors
- [ ] Test in browser
- [ ] Check responsive behavior

### For CLI Changes
- [ ] Test command locally
- [ ] Update help text if needed

### Documentation
- [ ] Update docstrings for new/changed functions
- [ ] Update relevant docs if API changes

## Quick Commands

```bash
# All-in-one check before commit
make lint && make typecheck && make test

# Format everything
make format

# Run specific test file
cd api && pytest tests/test_specific.py -v
```

## Commit Standards
- Use conventional commits where sensible
- Include meaningful commit messages
- Reference issues if applicable
