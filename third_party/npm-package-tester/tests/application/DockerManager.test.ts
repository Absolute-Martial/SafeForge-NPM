/**
 * Unit tests for DockerManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DockerManager } from 'application/DockerManager';

describe('DockerManager', () => {
  let dockerManager: DockerManager;

  beforeEach(() => {
    dockerManager = new DockerManager();
  });

  describe('configureNpmAuth', () => {
    it('should create .npmrc with npm token', async () => {
      const mockCreateFile = vi.spyOn(dockerManager, 'createFile').mockResolvedValue(undefined);

      await dockerManager.configureNpmAuth('container-id', 'test-token');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('//registry.npmjs.org/:_authToken=test-token')
      );
      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('always-auth=true')
      );

      mockCreateFile.mockRestore();
    });

    it('should create .npmrc with custom registry', async () => {
      const mockCreateFile = vi.spyOn(dockerManager, 'createFile').mockResolvedValue(undefined);

      await dockerManager.configureNpmAuth('container-id', undefined, 'https://npm.custom.com');

      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('registry=https://npm.custom.com')
      );

      mockCreateFile.mockRestore();
    });

    it('should create .npmrc with both token and custom registry', async () => {
      const mockCreateFile = vi.spyOn(dockerManager, 'createFile').mockResolvedValue(undefined);

      await dockerManager.configureNpmAuth(
        'container-id',
        'custom-token',
        'https://npm.company.com'
      );

      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('registry=https://npm.company.com')
      );
      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('//npm.company.com/:_authToken=custom-token')
      );
      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('always-auth=true')
      );

      mockCreateFile.mockRestore();
    });

    it('should not create .npmrc when no token or registry provided', async () => {
      const mockCreateFile = vi.spyOn(dockerManager, 'createFile').mockResolvedValue(undefined);

      await dockerManager.configureNpmAuth('container-id');

      expect(mockCreateFile).not.toHaveBeenCalled();

      mockCreateFile.mockRestore();
    });

    it('should extract hostname from registry URL', async () => {
      const mockCreateFile = vi.spyOn(dockerManager, 'createFile').mockResolvedValue(undefined);

      await dockerManager.configureNpmAuth(
        'container-id',
        'token123',
        'https://npm.pkg.github.com/'
      );

      expect(mockCreateFile).toHaveBeenCalledWith(
        'container-id',
        '/root/.npmrc',
        expect.stringContaining('//npm.pkg.github.com/:_authToken=token123')
      );

      mockCreateFile.mockRestore();
    });
  });

  describe('installPackage', () => {
    it('should configure auth before installing', async () => {
      const mockConfigureAuth = vi
        .spyOn(dockerManager, 'configureNpmAuth')
        .mockResolvedValue(undefined);
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: 'installed',
        stderr: '',
      });

      await dockerManager.installPackage(
        'container-id',
        'test-package',
        undefined,
        'npm-token',
        'https://registry.com'
      );

      expect(mockConfigureAuth).toHaveBeenCalledWith(
        'container-id',
        'npm-token',
        'https://registry.com'
      );
      expect(mockExecuteCommand).toHaveBeenCalledWith('container-id', [
        'npm',
        'install',
        '-g',
        'test-package',
      ]);

      mockConfigureAuth.mockRestore();
      mockExecuteCommand.mockRestore();
    });

    it('should install without auth when no token provided', async () => {
      const mockConfigureAuth = vi
        .spyOn(dockerManager, 'configureNpmAuth')
        .mockResolvedValue(undefined);
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: 'installed',
        stderr: '',
      });

      await dockerManager.installPackage('container-id', 'public-package');

      expect(mockConfigureAuth).toHaveBeenCalledWith('container-id', undefined, undefined);
      expect(mockExecuteCommand).toHaveBeenCalled();

      mockConfigureAuth.mockRestore();
      mockExecuteCommand.mockRestore();
    });
  });

  describe('file operations', () => {
    it('should create file in container', async () => {
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      await dockerManager.createFile('container-id', '/test/file.txt', 'content');

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'container-id',
        expect.arrayContaining(['sh', '-c'])
      );

      mockExecuteCommand.mockRestore();
    });

    it('should create directory in container', async () => {
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      await dockerManager.createDirectory('container-id', '/test/dir');

      expect(mockExecuteCommand).toHaveBeenCalledWith('container-id', ['mkdir', '-p', '/test/dir']);

      mockExecuteCommand.mockRestore();
    });

    it('should read file from container', async () => {
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: 'file content',
        stderr: '',
      });

      const content = await dockerManager.readFile('container-id', '/test/file.txt');

      expect(content).toBe('file content');
      expect(mockExecuteCommand).toHaveBeenCalledWith('container-id', ['cat', '/test/file.txt']);

      mockExecuteCommand.mockRestore();
    });

    it('should check if file exists', async () => {
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const exists = await dockerManager.fileExists('container-id', '/test/file.txt');

      expect(exists).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('container-id', [
        'test',
        '-f',
        '/test/file.txt',
      ]);

      mockExecuteCommand.mockRestore();
    });

    it('should return false when file does not exist', async () => {
      const mockExecuteCommand = vi.spyOn(dockerManager, 'executeCommand').mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: '',
      });

      const exists = await dockerManager.fileExists('container-id', '/test/nonexistent.txt');

      expect(exists).toBe(false);

      mockExecuteCommand.mockRestore();
    });
  });
});
