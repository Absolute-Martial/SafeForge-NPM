# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v3.1.1] - 2025-12-01

### Changed

bump patch versions for kitiumai packages

## [v3.1.0] - 2025-11-30

### Added

- Policy gates for allowed registries, Node versions, and base images.
- Compliance manager generating SBOMs, vulnerability scans, and license summaries (with artifact persistence).
- CLI flags to control compliance/policy features and base image selection.
- Result formatter now surfaces compliance and policy outcomes.

## [2.0.0] - 2025-11-21

### 🎉 Major Release: Library Testing & Type Validation

This major release expands the npm-package-tester from CLI-only testing (~20% of npm packages) to comprehensive support for both CLI and library packages (~90% of npm packages). It introduces sophisticated type validation, enhanced AI scenario generation, and detailed documentation analysis.

### ✨ Added

#### Priority 1: Library Export Detection & Testing

- **LibraryExportDetector**: Advanced export detection with dual parsing approach
  - AST-based parsing using Babel for accurate function/class/interface detection
  - Regex fallback for edge cases and edge files
  - Extracts function signatures, class methods, interface properties
  - Supports CommonJS, ESM, and hybrid export formats
  - Detects TypeScript type definitions

- **LibraryScenarioRunner**: Docker-based library test execution
  - Isolated Node.js environment for library testing
  - Support for ES6 and CommonJS imports
  - Configurable test setup (files, directories, dependencies)
  - Output validation with pattern matching and assertion checking
  - Error capture and reporting

- **LibraryScenarioGenerator** (Basic): Default library test scenarios
  - Import verification tests
  - Named export extraction tests
  - Instantiation and basic usage patterns

#### Priority 3: Enhanced AI Library Scenario Generation

- **Enhanced LibraryScenarioGenerator**: Advanced AI-powered test generation
  - Generates 4-6 comprehensive test scenarios per package (up from 2-4)
  - Scenario categories:
    - **Core Functionality**: Main/default exports with typical use cases
    - **Error Handling**: Invalid input handling with error expectations
    - **Advanced/Edge Cases**: Boundary conditions, extreme values, special cases
    - **Async/Promises** (optional): Async/await patterns for async functions
    - **Integration** (optional): Multi-export combination scenarios

- **Multi-Provider Support**:
  - Anthropic Claude: Enhanced prompts with detailed testing guidance
  - OpenAI GPT-4: Comprehensive scenario generation
  - Google Gemini: Realistic usage pattern generation
  - Groq Llama: Fast scenario generation

- **Improved Prompts**:
  - 200+ token detailed instructions for realistic, executable code
  - Specific patterns for async code (IIFE wrapping)
  - Error handling patterns (try-catch, promise rejection)
  - Output validation expectations
  - Code executability requirements

#### Priority 4: Type Checking & Validation

- **TypeDefinitionParser**: AST-based .d.ts file parsing
  - TypeScript compiler API integration
  - Extracts: interfaces, type aliases, enums, functions, classes, variables
  - Provides:
    - Function signatures with parameter and return types
    - Class methods with signatures
    - Interface properties with types and modifiers
    - Type alias definitions
    - Enum members with values
  - Supports TypeScript-specific constructs

- **TypeValidator**: Runtime vs type definition validation
  - Detects untyped exports
  - Reports missing type definitions for runtime exports
  - Identifies type definitions without runtime exports
  - Type mismatch detection
  - Deprecated export reporting

- **JSDocAnalyzer**: Documentation completeness analysis
  - Scoring system (0-100% completeness):
    - JSDoc presence
    - Description availability
    - Parameter documentation (@param)
    - Return type documentation (@returns)
    - Type annotation information
    - Example code presence (@example)
  - Categorized issue reporting (errors, warnings, info)
  - Undocumented export detection
  - Markdown report generation

#### Integration & CLI

- **TestRunner**: Type validation integration
  - Automatic type validation for library packages
  - Non-blocking validation (doesn't fail tests)
  - Includes validation results in test summary
  - Progress reporting for validation phase

- **ResultFormatter**: Enhanced CLI output
  - Type validation status display
  - Export statistics (typed, untyped, undocumented counts)
  - Documentation coverage percentage with visual bar (█░)
  - Categorized validation issue display
  - Summary statistics
  - Severity-based issue prioritization

- **Domain Type Extensions**:
  - `TypeValidationReport`: Comprehensive validation results
  - `ValidationIssue`: Detailed issue information
  - Extended `PackageTestSummary`: Optional type validation field

### 🔧 Changed

- **Library Export Detection**:
  - Now uses AST-based parsing for accuracy
  - Detects detailed export information (signatures, methods, properties)
  - Better handling of TypeScript exports

- **AI Scenario Generation**:
  - Default scenarios reduced to basic import tests (moved to library generation)
  - AI library scenarios expanded to 4-6 comprehensive tests
  - All AI providers now support library scenario generation

- **Dependencies**:
  - Added `@babel/parser@^7.23.6` for export parsing
  - Added `@babel/traverse@^7.23.6` for AST traversal
  - Added `typescript@^5.3.3` (runtime) for type definition parsing

### 🚀 Performance & Quality

- **Code Quality**:
  - Full TypeScript strict mode compilation
  - Zero TypeScript compilation errors
  - Modular architecture with clean separation of concerns
  - Comprehensive error handling and logging

- **Extensibility**:
  - Pluggable AI providers
  - Extensible validation framework
  - Customizable scenario generation

### 📊 Scope Expansion

| Metric          | v1.0.1          | v2.0.0                           | Growth    |
| --------------- | --------------- | -------------------------------- | --------- |
| Package Support | CLI only (~20%) | CLI + Library (~90%)             | 4.5x      |
| Test Scenarios  | 2-4 per package | 4-6+ per package                 | 2-3x      |
| Validation      | Basic           | Advanced (types, docs)           | New       |
| Export Info     | Name + type     | Signature + methods + properties | 3x detail |

### 🔍 What's Next

Future priorities:

- **Priority 5**: Enhanced error recovery and retry mechanisms
- **Priority 6**: Performance optimization and parallel testing
- **Priority 7**: Custom test framework integration (Jest, Mocha, etc.)
- **Priority 8**: CI/CD pipeline integration
- **Priority 9**: Report generation (HTML, JSON, XML)
- **Priority 10**: Marketplace integration (npm, PyPI, etc.)

### 🙏 Breaking Changes

None. v2.0.0 is fully backward compatible with v1.0.1. CLI-only functionality remains unchanged, with new library testing capabilities as opt-in enhancements.

### 📝 Upgrade Guide

No migration needed. Update and enjoy:

```bash
npm update @kitiumai/npm-package-tester
```

New features are automatically available:

- Library exports are automatically detected and analyzed
- Type validation is automatically performed for library packages
- AI-generated library scenarios are available with `--ai-provider` flag

### 🤝 Contributors

- **Ashish Yadav**: Core development and AI integration

---

## [1.0.1] - 2025-11-20

### Fixed

- Minor bug fixes and improvements

### Changed

- Initial stable release with CLI testing support

---

## [1.0.0] - 2025-11-20

### Added

- Initial release
- CLI command detection and testing
- Docker-based isolated testing environment
- Multi-version Node.js support
- AI-powered scenario generation
- Multi-provider AI support (Claude, GPT-4, Gemini, Groq)
- Private package authentication
- Scoped package support
- Semantic versioning for command output validation
