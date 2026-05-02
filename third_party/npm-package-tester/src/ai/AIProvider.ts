/**
 * AI Provider abstraction for generating test scenarios
 */

import {
  AIConfig,
  AIProvider,
  TestScenario,
  CLIExample,
  LibraryTestScenario,
  LibraryExports,
} from 'domain/models/types';

/* eslint-disable @typescript-eslint/naming-convention */

type AnthropicMessage = { text?: string };
type AnthropicResponse = { content?: AnthropicMessage[] };

type OpenAIChatChoice = { message: { content: string } };
type OpenAIChatResponse = { choices: OpenAIChatChoice[] };

type GoogleCandidate = { content?: { parts?: Array<{ text?: string }> } };
type GoogleResponse = { candidates?: GoogleCandidate[] };

type GroqResponse = OpenAIChatResponse;

type ParsedScenario = {
  name: string;
  description?: string;
  importStatement?: string;
  testCode?: string;
  expectedOutput?: string | RegExp | null;
  expectError?: boolean;
  args?: string[];
};

export interface AIProviderClient {
  generateScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): Promise<TestScenario[]>;

  generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]>;
}

export class AIProviderFactory {
  static create(config: AIConfig): AIProviderClient {
    switch (config.provider) {
      case AIProvider.ANTHROPIC:
        return new AnthropicProvider(config);
      case AIProvider.OPENAI:
        return new OpenAIProvider(config);
      case AIProvider.GOOGLE:
        return new GoogleProvider(config);
      case AIProvider.GROQ:
        return new GroqProvider(config);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  static getBestModel(provider: AIProvider): string {
    switch (provider) {
      case AIProvider.ANTHROPIC:
        return 'claude-sonnet-4-5-20250929';
      case AIProvider.OPENAI:
        return 'gpt-4o';
      case AIProvider.GOOGLE:
        return 'gemini-2.0-flash-exp';
      case AIProvider.GROQ:
        return 'llama-3.3-70b-versatile';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

class AnthropicProvider implements AIProviderClient {
  private readonly config: AIConfig;
  private readonly model: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model || AIProviderFactory.getBestModel(AIProvider.ANTHROPIC);
  }

  async generateScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): Promise<TestScenario[]> {
    const prompt = this.buildPrompt(
      packageName,
      packageDescription,
      readme,
      cliHelp,
      commands,
      examples
    );

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const content = data.content?.[0]?.text ?? '';

    return this.parseScenarios(content);
  }

  async generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]> {
    const prompt = this.buildLibraryPrompt(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples
    );

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as AnthropicResponse;
    const content = data.content?.[0]?.text ?? '';

    return this.parseLibraryScenarios(content);
  }

  private buildPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): string {
    const examplesSection =
      examples && examples.length > 0
        ? `\n\nCommand Examples (USE THESE EXACT COMMAND SYNTAXES):\n${examples.map((ex) => `- ${ex.command}\n  Description: ${ex.description}`).join('\n')}\n`
        : '';

    return `You are a test scenario generator for npm CLI packages. Your task is to create realistic test scenarios that validate the package functionality.

Package Information:
- Name: ${packageName}
- Description: ${packageDescription}
- Commands: ${commands.join(', ')}

README:
${readme.substring(0, 2000)}

CLI Help Output:
${cliHelp}${examplesSection}

IMPORTANT: If Command Examples are provided above, you MUST use those exact command syntaxes in your test scenarios. Do not invent different option names or arguments.

Generate 2-4 realistic test scenarios that:
1. Create appropriate input files/project structure
2. Run the CLI command with realistic arguments
3. Validate the expected output files and their contents

Return ONLY a JSON array of test scenarios with this exact structure:
[
  {
    "name": "scenario name",
    "description": "what this tests",
    "setup": {
      "files": [
        {"path": "relative/path/to/file", "content": "file contents"}
      ],
      "directories": ["dir1", "dir2"],
      "dependencies": ["package-name"],
      "initNpm": true
    },
    "command": "command-name",
    "args": ["arg1", "arg2"],
    "validate": {
      "exitCode": 0,
      "stdout": ["expected text"],
      "filesExist": ["path/to/output"],
      "fileContents": [
        {
          "path": "output/file",
          "contains": ["expected content"]
        }
      ]
    }
  }
]

Return ONLY the JSON array, no additional text.`;
  }

  private parseScenarios(content: string): TestScenario[] {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr) as { scenarios?: TestScenario[] } | TestScenario[];
      const scenarios = Array.isArray(parsed) ? parsed : parsed.scenarios || [];
      return scenarios;
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${(error as Error).message}`);
    }
  }

  private buildLibraryPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): string {
    const functionExports = libraryExports.namedExports.filter(
      (e) => e.type === 'function' || e.type === 'constant'
    );
    const classExports = libraryExports.namedExports.filter((e) => e.type === 'class');

    return `You are an expert software testing engineer specializing in JavaScript/Node.js library testing. Your task is to generate comprehensive, realistic test scenarios for the npm library package "${packageName}".

PACKAGE INFORMATION:
- Name: ${packageName}
- Description: ${packageDescription}
- Has Default Export: ${libraryExports.hasDefaultExport}
- Export Format: ${libraryExports.exportFormat}
${functionExports.length > 0 ? `- Functions/Constants: ${functionExports.map((e) => `${e.name}${e.signature ? ` ${e.signature}` : ''}`).join(', ')}` : ''}
${classExports.length > 0 ? `- Classes: ${classExports.map((e) => e.name).join(', ')}` : ''}
${libraryExports.typeDefinitions ? '- TypeScript types: Available' : ''}

DOCUMENTATION:
\`\`\`
${readme.substring(0, 2500)}
\`\`\`

${examples && examples.length > 0 ? `USAGE EXAMPLES:\n${examples.map((e) => `- ${e.description}: ${e.command}`).join('\n')}\n` : ''}

REQUIREMENTS:
Generate 4-6 diverse, realistic test scenarios covering:

1. **Core Functionality** (1-2 scenarios):
   - Test main/default exports with typical use cases
   - Include realistic input data and verify output

2. **Error Handling** (1 scenario):
   - Test error handling with invalid inputs
   - Show expect error handling

3. **Advanced/Edge Cases** (1-2 scenarios):
   - Test boundary conditions, empty inputs, extreme values
   - Test special cases mentioned in documentation
   - Test with various data types

4. **Async/Promises** (optional, if applicable):
   - If library has async functions, test async/await patterns
   - Include promise resolution with console.log

5. **Integration** (optional, if multiple exports):
   - Test using multiple exports together
   - Test chaining or combined usage patterns

SCENARIO FORMAT:
Each scenario MUST be valid JSON with:
- name: Descriptive name (lowercase, hyphens)
- description: What this tests (1-2 sentences)
- importStatement: Exact import code
- testCode: Complete, executable JavaScript that:
  * Uses importStatement exactly
  * Logs all results with console.log()
  * For async: wrap in (async () => { ... })()
  * For errors: use try-catch and log errors
  * Must be runnable as-is without modifications
- expectedOutput: String or regex pattern expected in stdout (null for error tests)
- expectError: true if code should throw/error

CRITICAL RULES:
- All code must be valid JavaScript runnable in Node.js
- For async code, wrap in IIFE: (async () => { ... })()
- Include at least one error handling scenario
- Make scenarios realistic, not trivial
- Don't use external dependencies beyond ${packageName}

OUTPUT FORMAT:
Return ONLY valid JSON with "scenarios" array:
\`\`\`json
{
  "scenarios": [
    {
      "name": "basic-usage",
      "description": "Test basic usage of main export",
      "importStatement": "const lib = require('${packageName}')",
      "testCode": "const result = lib.transform('test'); console.log(JSON.stringify(result));",
      "expectedOutput": ".*",
      "expectError": false
    },
    {
      "name": "error-handling",
      "description": "Test error handling with invalid input",
      "importStatement": "const lib = require('${packageName}')",
      "testCode": "try { lib.process(null); } catch (e) { console.log('Error: ' + e.message); }",
      "expectedOutput": null,
      "expectError": false
    }
  ]
}
\`\`\`

Generate 4-6 comprehensive test scenarios now:`;
  }

  private parseLibraryScenarios(content: string): LibraryTestScenario[] {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const data = JSON.parse(jsonStr) as { scenarios?: ParsedScenario[] } | ParsedScenario[];
      const scenarios = Array.isArray(data) ? data : data.scenarios || [];
      return scenarios.map((scenario) => {
        const base: Omit<LibraryTestScenario, 'description' | 'expectedOutput'> = {
          name: scenario.name,
          importStatement: scenario.importStatement ?? '',
          testCode: scenario.testCode ?? '',
          expectError: scenario.expectError === true,
        };
        const result: Record<string, unknown> = base;
        if (scenario.description !== undefined) {
          result['description'] = scenario.description;
        }
        if (scenario.expectedOutput !== undefined && scenario.expectedOutput !== null) {
          result['expectedOutput'] = scenario.expectedOutput;
        }
        return result as unknown as LibraryTestScenario;
      });
    } catch (error) {
      throw new Error(`Failed to parse library scenarios: ${(error as Error).message}`);
    }
  }
}

class OpenAIProvider implements AIProviderClient {
  private readonly config: AIConfig;
  private readonly model: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model || AIProviderFactory.getBestModel(AIProvider.OPENAI);
  }

  async generateScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): Promise<TestScenario[]> {
    const prompt = this.buildPrompt(
      packageName,
      packageDescription,
      readme,
      cliHelp,
      commands,
      examples
    );

    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message.content ?? '';

    return this.parseScenarios(content);
  }

  private buildPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): string {
    const examplesSection =
      examples && examples.length > 0
        ? `\nCommand Examples (USE THESE EXACT SYNTAXES): ${examples.map((ex) => `${ex.command} - ${ex.description}`).join('; ')}`
        : '';

    // Same prompt structure as Anthropic
    return `You are a test scenario generator for npm CLI packages. Generate realistic test scenarios in JSON format.

Package: ${packageName}
Description: ${packageDescription}
Commands: ${commands.join(', ')}
README: ${readme.substring(0, 2000)}
CLI Help: ${cliHelp}${examplesSection}

IMPORTANT: If Command Examples are provided, use those exact command syntaxes in your scenarios.

Return a JSON object with a "scenarios" array containing 2-4 test scenarios.`;
  }

  private parseScenarios(content: string): TestScenario[] {
    const parsed = JSON.parse(content) as { scenarios?: TestScenario[] } | TestScenario[];
    const scenarios = Array.isArray(parsed) ? parsed : parsed.scenarios || [];
    return scenarios;
  }

  async generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]> {
    const prompt = this.buildLibraryPrompt(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples
    );

    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error: ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices?.[0]?.message.content ?? '';

    return this.parseLibraryScenarios(content);
  }

  private buildLibraryPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    _examples?: readonly CLIExample[]
  ): string {
    const functionExports = libraryExports.namedExports.filter(
      (e) => e.type === 'function' || e.type === 'constant'
    );
    const classExports = libraryExports.namedExports.filter((e) => e.type === 'class');

    return `You are an expert software testing engineer specializing in JavaScript/Node.js library testing. Generate comprehensive test scenarios for "${packageName}".

PACKAGE: ${packageName}
DESCRIPTION: ${packageDescription}
EXPORTS: Default=${libraryExports.hasDefaultExport}, Format=${libraryExports.exportFormat}
${functionExports.length > 0 ? `Functions: ${functionExports.map((e) => e.name).join(', ')}` : ''}
${classExports.length > 0 ? `Classes: ${classExports.map((e) => e.name).join(', ')}` : ''}

README: ${readme.substring(0, 2000)}

Generate 4-6 test scenarios (core functionality, error handling, edge cases, async if applicable, integration).

Return JSON with "scenarios" array. Each scenario has: name, description, importStatement, testCode (executable Node.js), expectedOutput, expectError.`;
  }

  private parseLibraryScenarios(content: string): LibraryTestScenario[] {
    const data = JSON.parse(content) as { scenarios?: ParsedScenario[] } | ParsedScenario[];
    const scenarios = Array.isArray(data) ? data : data.scenarios || [];
    return scenarios.map((scenario) => {
      const base: Omit<LibraryTestScenario, 'description' | 'expectedOutput'> = {
        name: scenario.name,
        importStatement: scenario.importStatement ?? '',
        testCode: scenario.testCode ?? '',
        expectError: scenario.expectError === true,
      };
      const result: Record<string, unknown> = base;
      if (scenario.description !== undefined) {
        result['description'] = scenario.description;
      }
      if (scenario.expectedOutput !== undefined && scenario.expectedOutput !== null) {
        result['expectedOutput'] = scenario.expectedOutput;
      }
      return result as unknown as LibraryTestScenario;
    });
  }
}

class GoogleProvider implements AIProviderClient {
  private readonly config: AIConfig;
  private readonly model: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model || AIProviderFactory.getBestModel(AIProvider.GOOGLE);
  }

  async generateScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): Promise<TestScenario[]> {
    const prompt = this.buildPrompt(
      packageName,
      packageDescription,
      readme,
      cliHelp,
      commands,
      examples
    );

    const baseUrl =
      this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await fetch(
      `${baseUrl}/${this.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }

    const data = (await response.json()) as GoogleResponse;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return this.parseScenarios(content);
  }

  private buildPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): string {
    const examplesSection =
      examples && examples.length > 0
        ? `\n\nCommand Examples (USE THESE EXACT COMMAND SYNTAXES):\n${examples.map((ex) => `- ${ex.command}\n  Description: ${ex.description}`).join('\n')}\n`
        : '';

    return `You are a test scenario generator for npm CLI packages. Your task is to create realistic test scenarios that validate the package functionality.

Package Information:
- Name: ${packageName}
- Description: ${packageDescription}
- Commands: ${commands.join(', ')}

README:
${readme.substring(0, 2000)}

CLI Help Output:
${cliHelp}${examplesSection}

IMPORTANT: If Command Examples are provided above, you MUST use those exact command syntaxes in your test scenarios. Do not invent different option names or arguments.

Generate 2-4 realistic test scenarios that:
1. Create appropriate input files/project structure
2. Run the CLI command with realistic arguments
3. Validate the expected output files and their contents

Return ONLY a JSON array of test scenarios with this exact structure:
[
  {
    "name": "scenario name",
    "description": "what this tests",
    "setup": {
      "files": [
        {"path": "relative/path/to/file", "content": "file contents"}
      ],
      "directories": ["dir1", "dir2"],
      "dependencies": ["package-name"],
      "initNpm": true
    },
    "command": "command-name",
    "args": ["arg1", "arg2"],
    "validate": {
      "exitCode": 0,
      "stdout": ["expected text"],
      "filesExist": ["path/to/output"],
      "fileContents": [
        {
          "path": "output/file",
          "contains": ["expected content"]
        }
      ]
    }
  }
]

Return ONLY the JSON array, no additional text.`;
  }

  private parseScenarios(content: string): TestScenario[] {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const scenarios = JSON.parse(jsonStr) as TestScenario[] | { scenarios?: TestScenario[] };
    return Array.isArray(scenarios) ? scenarios : scenarios.scenarios || [];
  }

  async generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]> {
    const prompt = this.buildLibraryPrompt(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples
    );

    const baseUrl =
      this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
    const response = await fetch(
      `${baseUrl}/${this.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }

    const data = (await response.json()) as GoogleResponse;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return this.parseLibraryScenarios(content);
  }

  private buildLibraryPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    _examples?: readonly CLIExample[]
  ): string {
    const functionExports = libraryExports.namedExports.filter(
      (e) => e.type === 'function' || e.type === 'constant'
    );
    const classExports = libraryExports.namedExports.filter((e) => e.type === 'class');

    return `You are an expert JavaScript library testing engineer. Generate 4-6 comprehensive test scenarios for "${packageName}".

Package: ${packageName}
Description: ${packageDescription}
Has Default Export: ${libraryExports.hasDefaultExport}
Export Format: ${libraryExports.exportFormat}
${functionExports.length > 0 ? `Functions: ${functionExports.map((e) => e.name).join(', ')}` : ''}
${classExports.length > 0 ? `Classes: ${classExports.map((e) => e.name).join(', ')}` : ''}

Documentation: ${readme.substring(0, 2000)}

Return ONLY JSON with "scenarios" array. Each scenario: name, description, importStatement, testCode (executable Node.js code), expectedOutput, expectError.
Include core functionality, error handling, edge cases, and async patterns if applicable.`;
  }

  private parseLibraryScenarios(content: string): LibraryTestScenario[] {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const data = JSON.parse(jsonStr) as { scenarios?: ParsedScenario[] } | ParsedScenario[];
    const scenarios = Array.isArray(data) ? data : data.scenarios || [];
    return scenarios.map((scenario) => {
      const base: Omit<LibraryTestScenario, 'description' | 'expectedOutput'> = {
        name: scenario.name,
        importStatement: scenario.importStatement ?? '',
        testCode: scenario.testCode ?? '',
        expectError: scenario.expectError === true,
      };
      const result: Record<string, unknown> = base;
      if (scenario.description !== undefined) {
        result['description'] = scenario.description;
      }
      if (scenario.expectedOutput !== undefined && scenario.expectedOutput !== null) {
        result['expectedOutput'] = scenario.expectedOutput;
      }
      return result as unknown as LibraryTestScenario;
    });
  }
}

class GroqProvider implements AIProviderClient {
  private readonly config: AIConfig;
  private readonly model: string;

  constructor(config: AIConfig) {
    this.config = config;
    this.model = config.model || AIProviderFactory.getBestModel(AIProvider.GROQ);
  }

  async generateScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): Promise<TestScenario[]> {
    const prompt = this.buildPrompt(
      packageName,
      packageDescription,
      readme,
      cliHelp,
      commands,
      examples
    );

    const baseUrl = this.config.baseUrl || 'https://api.groq.com/openai/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = (await response.json()) as GroqResponse;
    const content = data.choices?.[0]?.message.content ?? '';

    return this.parseScenarios(content);
  }

  private buildPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    cliHelp: string,
    commands: string[],
    examples?: readonly CLIExample[]
  ): string {
    const examplesSection =
      examples && examples.length > 0
        ? `\n\nCommand Examples (USE THESE EXACT COMMAND SYNTAXES):\n${examples.map((ex) => `- ${ex.command}\n  Description: ${ex.description}`).join('\n')}\n`
        : '';

    return `You are a test scenario generator for npm CLI packages. Your task is to create realistic test scenarios that validate the package functionality.

Package Information:
- Name: ${packageName}
- Description: ${packageDescription}
- Commands: ${commands.join(', ')}

README:
${readme.substring(0, 2000)}

CLI Help Output:
${cliHelp}${examplesSection}

IMPORTANT: If Command Examples are provided above, you MUST use those exact command syntaxes in your test scenarios. Do not invent different option names or arguments.

Generate 2-4 realistic test scenarios that:
1. Create appropriate input files/project structure
2. Run the CLI command with realistic arguments
3. Validate the expected output files and their contents

Return ONLY a JSON array of test scenarios with this exact structure:
[
  {
    "name": "scenario name",
    "description": "what this tests",
    "setup": {
      "files": [
        {"path": "relative/path/to/file", "content": "file contents"}
      ],
      "directories": ["dir1", "dir2"],
      "dependencies": ["package-name"],
      "initNpm": true
    },
    "command": "command-name",
    "args": ["arg1", "arg2"],
    "validate": {
      "exitCode": 0,
      "stdout": ["expected text"],
      "filesExist": ["path/to/output"],
      "fileContents": [
        {
          "path": "output/file",
          "contains": ["expected content"]
        }
      ]
    }
  }
]

Return ONLY the JSON array, no additional text.`;
  }

  private parseScenarios(content: string): TestScenario[] {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const scenarios = JSON.parse(jsonStr) as TestScenario[] | { scenarios?: TestScenario[] };
    return Array.isArray(scenarios) ? scenarios : scenarios.scenarios || [];
  }

  async generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]> {
    const prompt = this.buildLibraryPrompt(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples
    );

    const baseUrl = this.config.baseUrl || 'https://api.groq.com/openai/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = (await response.json()) as GroqResponse;
    const content = data.choices?.[0]?.message.content ?? '';

    return this.parseLibraryScenarios(content);
  }

  private buildLibraryPrompt(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    _examples?: readonly CLIExample[]
  ): string {
    const functionExports = libraryExports.namedExports.filter(
      (e) => e.type === 'function' || e.type === 'constant'
    );
    const classExports = libraryExports.namedExports.filter((e) => e.type === 'class');

    return `Generate 4-6 comprehensive test scenarios for "${packageName}" library.

Package: ${packageName}
Description: ${packageDescription}
Has Default Export: ${libraryExports.hasDefaultExport}
Export Format: ${libraryExports.exportFormat}
${functionExports.length > 0 ? `Functions: ${functionExports.map((e) => e.name).join(', ')}` : ''}
${classExports.length > 0 ? `Classes: ${classExports.map((e) => e.name).join(', ')}` : ''}

Documentation: ${readme.substring(0, 2000)}

Scenarios should include: core functionality, error handling, edge cases, async patterns if applicable.
Return JSON array with name, description, importStatement, testCode (runnable Node.js), expectedOutput, expectError.`;
  }

  private parseLibraryScenarios(content: string): LibraryTestScenario[] {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const data = JSON.parse(jsonStr) as { scenarios?: ParsedScenario[] } | ParsedScenario[];
    const scenarios = Array.isArray(data) ? data : data.scenarios || [];
    return scenarios.map((scenario) => {
      const base: Omit<LibraryTestScenario, 'description' | 'expectedOutput'> = {
        name: scenario.name,
        importStatement: scenario.importStatement ?? '',
        testCode: scenario.testCode ?? '',
        expectError: scenario.expectError === true,
      };
      const result: Record<string, unknown> = base;
      if (scenario.description !== undefined) {
        result['description'] = scenario.description;
      }
      if (scenario.expectedOutput !== undefined && scenario.expectedOutput !== null) {
        result['expectedOutput'] = scenario.expectedOutput;
      }
      return result as unknown as LibraryTestScenario;
    });
  }
}
