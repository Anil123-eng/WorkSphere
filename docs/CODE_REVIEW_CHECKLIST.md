# Code Review Checklist

## Functionality
- [ ] Changes meet the stated requirements.
- [ ] Backend enforces the expected business rules.
- [ ] Invalid input and expected failures are handled.

## Code Quality
- [ ] Naming and module boundaries are clear.
- [ ] No unnecessary code or unrelated changes.
- [ ] Errors do not expose stack traces, credentials, or sensitive data.

## Testing
- [ ] Main success path is tested.
- [ ] Invalid input is tested.
- [ ] Authorization or boundary cases are tested.
- [ ] At least one failure path is tested.
- [ ] Relevant automated tests pass.

## Documentation and Security
- [ ] Setup and configuration instructions are updated.
- [ ] No secrets are committed.
- [ ] API or behavior changes are documented.
