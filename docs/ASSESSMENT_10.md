# Assessment 10 – Git and Engineering Collaboration

## Objective
Demonstrate professional Git collaboration using feature branches, meaningful commits, pull requests, code ownership, branch protection, issue tracking, code reviews, and conflict resolution.

## Branching Strategy
- master: Main integration branch.
- feature/*: Individual feature or assessment work.
- Submit changes through pull requests.

## Commit Convention
Use clear commit messages:
- feat: add a feature
- fix: correct a bug
- docs: update documentation
- test: add tests
- chore: configuration changes

## Pull Request Workflow
1. Create an issue.
2. Create a feature branch.
3. Implement and test changes.
4. Commit and push changes.
5. Open a pull request and link the issue.
6. Complete the review checklist.
7. Merge after approval and required checks.

## Code Ownership
The .github/CODEOWNERS file identifies the default code owner.

## Branch Protection
Configure GitHub rules for master to require pull requests and approvals where available.

## Issue Tracking
Use the Engineering Task template in .github/ISSUE_TEMPLATE/.

## Code Review
Use docs/CODE_REVIEW_CHECKLIST.md.

## Merge Conflict Resolution
1. Fetch the latest repository changes.
2. Merge the target branch into the feature branch.
3. Identify conflicts using git status.
4. Resolve conflict markers in affected files.
5. Stage resolved files.
6. Complete the merge commit.
7. Run relevant tests.

Commands:
git fetch origin
git merge origin/master
git status
git add <resolved-file>
git commit
git push

## Validation
Run the automated test suite before requesting review.

## Evidence
- Feature branch and meaningful commit history.
- GitHub issue and pull request.
- Code owner and branch protection configuration.
- Completed review checklist.
- Merge conflict resolution.
- Automated test results.
