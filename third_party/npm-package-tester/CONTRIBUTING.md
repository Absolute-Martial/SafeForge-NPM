# Contributing to npm-package-tester

First off, thank you for considering contributing to npm-package-tester! 🎉

It's people like you that make npm-package-tester such a great tool. We welcome contributions from everyone, whether it's a bug report, feature request, documentation improvement, or code contribution.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Guidelines](#coding-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [ashish.yd@gmail.com](mailto:ashish.yd@gmail.com).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/kitium-ai/npm-package-tester/issues) to avoid duplicates.

When you create a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (package names, commands, etc.)
- **Describe the behavior you observed** and what you expected
- **Include screenshots or logs** if applicable
- **Mention your environment**:
  - OS (Windows, macOS, Linux)
  - Node.js version
  - Docker version
  - npm-package-tester version

Use our [bug report template](https://github.com/kitium-ai/npm-package-tester/issues/new?template=bug_report.yml) to create your issue.

### Suggesting Features

We love hearing ideas for new features! Before creating a feature request:

- **Check if the feature has already been suggested**
- **Consider if it fits the project's scope** (testing npm packages with CLI commands)
- **Provide a clear use case** for why this feature would be useful

Use our [feature request template](https://github.com/kitium-ai/npm-package-tester/issues/new?template=feature_request.yml) to suggest your idea.

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- [`good first issue`](https://github.com/kitium-ai/npm-package-tester/labels/good%20first%20issue) - Simple issues perfect for newcomers
- [`help wanted`](https://github.com/kitium-ai/npm-package-tester/labels/help%20wanted) - Issues where we need community help

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding guidelines
3. **Add tests** if you've added code that should be tested
4. **Ensure all tests pass** (`npm test`)
5. **Run linting** (`npm run lint`)
6. **Update documentation** if needed (README.md, JSDoc comments)
7. **Write a clear commit message** following our guidelines
8. **Open a pull request** with a clear title and description

#### Pull Request Guidelines

- Keep PRs focused on a single feature or bug fix
- Link related issues in the PR description
- Ensure CI checks pass
- Be responsive to feedback and questions
- Update the PR if the main branch has moved forward

## Development Setup

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn
- Docker installed and running
- Git

### Setup Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/npm-package-tester.git
cd npm-package-tester

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Run tests
npm test

# 5. Run linting
npm run lint

# 6. (Optional) Link for local testing
npm link
```

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:watch` - Watch mode for development
- `npm test` - Run all tests with coverage
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests only
- `npm run lint` - Check for linting errors
- `npm run lint:fix` - Fix linting errors automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Testing Your Changes Locally

After linking the package (`npm link`), you can test it on real packages:

```bash
# Test a published package
npt test eslint

# Test a local package
cd /path/to/your-test-package
npt test .

# Test with AI features (requires API key)
npt test my-package --ai-provider anthropic --ai-token YOUR_KEY
```

## Project Structure

```
npm-package-tester/
├── src/
│   ├── ai/                    # AI providers and scenario generation
│   │   ├── AIProvider.ts      # Multi-provider AI abstraction
│   │   └── ScenarioGenerator.ts
│   ├── application/           # Core business logic
│   │   ├── PackageAnalyzer.ts # Analyzes package.json
│   │   ├── DockerManager.ts   # Docker container management
│   │   ├── TestRunner.ts      # Test execution
│   │   └── ScenarioRunner.ts  # AI scenario execution
│   ├── domain/
│   │   └── models/
│   │       └── types.ts       # Type definitions
│   ├── formatters/
│   │   └── ResultFormatter.ts # Output formatting
│   ├── cli/
│   │   └── index.ts           # CLI interface
│   └── index.ts               # Public API
├── tests/                     # Test files
├── dist/                      # Compiled JavaScript (generated)
└── coverage/                  # Test coverage reports (generated)
```

### Architecture Principles

We follow **Clean Architecture** principles:

- **Domain Layer**: Pure business logic, no external dependencies
- **Application Layer**: Use cases and business logic orchestration
- **AI Layer**: AI provider integrations and test generation
- **Infrastructure Layer**: External concerns (Docker, file system)
- **CLI Layer**: User interface and command handling

## Coding Guidelines

### TypeScript Style

- Use **TypeScript** for all code
- Enable **strict mode** (already configured)
- Use **interfaces** over types where appropriate
- Prefer **const** over let, avoid var
- Use **async/await** over promises chains
- Add **JSDoc comments** for public APIs

### Naming Conventions

- **Classes**: PascalCase (e.g., `PackageAnalyzer`)
- **Interfaces**: PascalCase with 'I' prefix where needed (e.g., `TestResult`)
- **Functions/Methods**: camelCase (e.g., `detectCommands`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT`)
- **Files**: PascalCase for classes, camelCase for utilities

### Code Quality

- Keep functions **small and focused** (single responsibility)
- Avoid **deep nesting** (max 3 levels)
- Write **descriptive variable names**
- Handle **errors gracefully** with try-catch
- Add **logging** for important operations
- Avoid **magic numbers** - use named constants

### Example

```typescript
/**
 * Analyzes a package.json file to detect CLI commands
 * @param packagePath - Path to the package directory
 * @returns Array of detected CLI commands
 */
export async function detectCommands(packagePath: string): Promise<string[]> {
  try {
    const packageJson = await readPackageJson(packagePath);
    const commands = extractBinCommands(packageJson);

    if (commands.length === 0) {
      throw new Error('No CLI commands found in package.json');
    }

    return commands;
  } catch (error) {
    logger.error('Failed to detect commands', error);
    throw error;
  }
}
```

## Testing Guidelines

### Test Structure

- Place tests in `tests/` directory, mirroring `src/` structure
- Name test files with `.test.ts` suffix
- Use **Jest** as the testing framework

### Writing Tests

```typescript
describe('PackageAnalyzer', () => {
  let analyzer: PackageAnalyzer;

  beforeEach(() => {
    analyzer = new PackageAnalyzer();
  });

  describe('analyzePackage', () => {
    it('should detect CLI commands from bin field', async () => {
      const result = await analyzer.analyzePackage('./fixtures/simple-package');

      expect(result.commands).toContain('mycli');
      expect(result.version).toBe('1.0.0');
    });

    it('should throw error for packages without bin field', async () => {
      await expect(analyzer.analyzePackage('./fixtures/no-bin-package')).rejects.toThrow(
        'No CLI commands found',
      );
    });
  });
});
```

### Test Coverage

- Aim for **>80% code coverage**
- Write tests for:
  - Happy paths
  - Error cases
  - Edge cases
  - Integration scenarios
- Mock external dependencies (Docker, file system)

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- PackageAnalyzer.test.ts

# Run with verbose output
npm test -- --verbose
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, no code change)
- **refactor**: Code refactoring (no functional change)
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build config)
- **perf**: Performance improvements

### Examples

```
feat(ai): add support for Google Gemini AI provider

- Implement Gemini API integration
- Add model selection for Gemini 2.0 Flash
- Update documentation with Gemini setup instructions

Closes #123
```

```
fix(docker): resolve container cleanup issue on Windows

The Docker containers were not being properly cleaned up on Windows
due to path separator issues. This commit fixes the path handling
to use platform-agnostic separators.

Fixes #456
```

```
docs(readme): update installation instructions

Add npm alternative installation method and clarify Docker requirements.
```

## Community

### Getting Help

- 💬 [GitHub Discussions](https://github.com/kitium-ai/npm-package-tester/discussions) - Ask questions and share ideas
- 🐛 [Issue Tracker](https://github.com/kitium-ai/npm-package-tester/issues) - Report bugs and request features
- 📧 [Email](mailto:ashish.yd@gmail.com) - Direct contact for sensitive matters

### Recognition

Contributors are recognized in several ways:

- Listed in GitHub's contributors page
- Mentioned in release notes for significant contributions
- Invited to be project collaborators for sustained contributions

## License

By contributing to npm-package-tester, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing! 🙌**

Your efforts help make npm package testing better for everyone.
