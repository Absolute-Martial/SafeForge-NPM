/**
 * Manages Docker containers for testing npm packages
 */

import dockerode from 'dockerode';
import { TestEnvironment, ContainerState, ProgressEvent, TestStage } from 'domain/models/types';

/* eslint-disable @typescript-eslint/naming-convention */

export class DockerManager {
  private readonly docker: dockerode;
  private readonly containers: Set<string> = new Set();

  constructor() {
    this.docker = new dockerode();
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a test container
   */
  async createTestContainer(
    environment: TestEnvironment,
    packageName: string,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<ContainerState> {
    // Pull image
    if (onProgress) {
      onProgress({
        stage: TestStage.PULLING_IMAGE,
        message: `Pulling ${environment.baseImage}`,
      });
    }

    await this.pullImage(environment.baseImage);

    // Create container
    if (onProgress) {
      onProgress({
        stage: TestStage.CREATING_CONTAINER,
        message: `Creating container for Node ${environment.nodeVersion}`,
      });
    }

    const container = await this.docker.createContainer({
      Image: environment.baseImage,
      Cmd: ['sleep', 'infinity'],
      Labels: {
        'npm-package-tester': 'true',
        'node-version': environment.nodeVersion,
        package: packageName,
      },
      WorkingDir: '/test',
    });

    const info = await container.inspect();
    const containerId = info.Id;

    // Start container
    await container.start();

    // Track container
    this.containers.add(containerId);

    return {
      id: containerId,
      nodeVersion: environment.nodeVersion,
      packageName,
      status: 'running',
    };
  }

  /**
   * Configure npm authentication in container
   */
  async configureNpmAuth(
    containerId: string,
    npmToken?: string,
    npmRegistry?: string
  ): Promise<void> {
    if (!npmToken && !npmRegistry) {
      return; // No authentication needed
    }

    let npmrcContent = '';

    if (npmRegistry) {
      npmrcContent += `registry=${npmRegistry}\n`;
    }

    if (npmToken) {
      // Determine registry for token authentication
      const registry = npmRegistry || 'https://registry.npmjs.org/';
      const registryHost = new URL(registry).hostname;

      // Add authentication token
      npmrcContent += `//${registryHost}/:_authToken=${npmToken}\n`;
      npmrcContent += `always-auth=true\n`;
    }

    // Create .npmrc in container
    await this.createFile(containerId, '/root/.npmrc', npmrcContent);
  }

  /**
   * Install package in container
   */
  async installPackage(
    containerId: string,
    packageName: string,
    onProgress?: (event: ProgressEvent) => void,
    npmToken?: string,
    npmRegistry?: string
  ): Promise<void> {
    if (onProgress) {
      onProgress({
        stage: TestStage.INSTALLING_PACKAGE,
        message: `Installing ${packageName}`,
      });
    }

    // Configure npm authentication if provided
    await this.configureNpmAuth(containerId, npmToken, npmRegistry);

    await this.executeCommand(containerId, ['npm', 'install', '-g', packageName]);
  }

  /**
   * Execute command in container
   */
  async executeCommand(
    containerId: string,
    command: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    // Collect output
    let stdout = '';
    let stderr = '';

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes streams with 8-byte header
        // First byte indicates stream type: 1=stdout, 2=stderr
        if (chunk.length > 8) {
          const header = chunk.readUInt8(0);
          const data = chunk.slice(8).toString();

          if (header === 1) {
            stdout += data;
          } else if (header === 2) {
            stderr += data;
          }
        }
      });

      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    // Get exit code
    const inspectResult = await exec.inspect();
    const exitCode = inspectResult.ExitCode ?? 0;

    return {
      exitCode,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  }

  /**
   * Create a file in the container
   */
  async createFile(containerId: string, filePath: string, content: string): Promise<void> {
    // Use echo with heredoc to create file
    const command = ['sh', '-c', `cat > ${filePath} << 'EOFMARKER'\n${content}\nEOFMARKER`];
    await this.executeCommand(containerId, command);
  }

  /**
   * Create a directory in the container
   */
  async createDirectory(containerId: string, dirPath: string): Promise<void> {
    await this.executeCommand(containerId, ['mkdir', '-p', dirPath]);
  }

  /**
   * Read a file from the container
   */
  async readFile(containerId: string, filePath: string): Promise<string> {
    const result = await this.executeCommand(containerId, ['cat', filePath]);
    return result.stdout;
  }

  /**
   * Check if file exists in container
   */
  async fileExists(containerId: string, filePath: string): Promise<boolean> {
    const result = await this.executeCommand(containerId, ['test', '-f', filePath]);
    return result.exitCode === 0;
  }

  /**
   * Pull Docker image
   */
  private async pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
          () => {
            // Progress callback - ignore for now
          }
        );
      });
    });
  }

  /**
   * Cleanup containers
   */
  async cleanup(keepContainers: boolean): Promise<void> {
    if (keepContainers) {
      return;
    }

    const cleanupPromises = Array.from(this.containers).map(async (containerId) => {
      try {
        const container = this.docker.getContainer(containerId);

        // Stop container
        try {
          await container.stop({ t: 5 });
        } catch {
          // Already stopped
        }

        // Remove container
        await container.remove({ force: true });
      } catch {
        // Ignore errors during cleanup
      }
    });

    await Promise.all(cleanupPromises);
    this.containers.clear();
  }
}
