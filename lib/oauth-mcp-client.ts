import { MCPClient } from '@modelcontextprotocol/sdk';
import * as fs from 'fs';
import * as path from 'path';

export class OAuthMCPClient extends MCPClient {
  private cacheDir: string;
  private clientIdFile: string;
  private tokenFile: string;

  constructor(options: { cacheDir?: string } = {}) {
    super();
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.mcp-cache');
    this.clientIdFile = path.join(this.cacheDir, 'client_id.json');
    this.tokenFile = path.join(this.cacheDir, 'tokens.json');
  }

  /**
   * Handle OAuth completion with error recovery for invalid client IDs
   */
  async completeOAuth(code: string, state: string): Promise<void> {
    try {
      await super.completeOAuth(code, state);
    } catch (error) {
      if (this.isInvalidClientIdError(error)) {
        console.warn('Invalid client ID detected. Resetting client state and re-registering...');
        await this.resetClientState();
        await this.registerClient();
        // Retry the OAuth completion with new client ID
        await super.completeOAuth(code, state);
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if error is due to invalid/expired client ID
   */
  private isInvalidClientIdError(error: any): boolean {
    const errorMessage = error.message || error.toString();
    return errorMessage.includes('client_id') &&
           (errorMessage.includes('invalid') ||
            errorMessage.includes('expired') ||
            errorMessage.includes('not found'));
  }

  /**
   * Reset client state by clearing cached files
   */
  async resetClientState(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.promises.mkdir(this.cacheDir, { recursive: true });

      // Remove cached client ID and tokens
      const filesToRemove = [this.clientIdFile, this.tokenFile];
      for (const file of filesToRemove) {
        try {
          await fs.promises.unlink(file);
        } catch (err) {
          // Ignore if file doesn't exist
        }
      }

      console.log('Client state reset successfully');
    } catch (error) {
      console.error('Failed to reset client state:', error);
      throw error;
    }
  }

  /**
   * Register client and store new client ID
   */
  async registerClient(): Promise<void> {
    try {
      // Clear any existing client ID
      this.clientId = undefined;

      // Call the registration endpoint
      const response = await this.makeRequest('/register', {
        method: 'POST',
        body: {
          client_name: 'MCP OAuth Client',
          redirect_uris: [this.redirectUri],
          scope: this.scopes.join(' ')
        }
      });

      this.clientId = response.client_id;

      // Cache the new client ID
      await fs.promises.writeFile(
        this.clientIdFile,
        JSON.stringify({
          client_id: this.clientId,
          created_at: new Date().toISOString()
        }, null, 2)
      );

      console.log('Client registered successfully with ID:', this.clientId);
    } catch (error) {
      console.error('Failed to register client:', error);
      throw error;
    }
  }

  /**
   * Initialize client with automatic state recovery
   */
  async initialize(): Promise<void> {
    try {
      // Try to load cached client ID
      await this.loadCachedState();

      // Initialize the parent client
      await super.initialize();
    } catch (error) {
      if (this.isInvalidClientIdError(error)) {
        console.warn('Cached client ID invalid. Resetting and re-registering...');
        await this.resetClientState();
        await this.registerClient();
        await super.initialize();
      } else {
        throw error;
      }
    }
  }

  /**
   * Load cached client state
   */
  private async loadCachedState(): Promise<void> {
    try {
      const clientIdData = await fs.promises.readFile(this.clientIdFile, 'utf-8');
      const { client_id } = JSON.parse(clientIdData);
      this.clientId = client_id;

      // Optional: check if client ID is expired (implement based on your server's TTL)
      // const { created_at } = JSON.parse(clientIdData);
      // const age = Date.now() - new Date(created_at).getTime();
      // if (age > 24 * 60 * 60 * 1000) { // 24 hours
      //   throw new Error('Client ID expired');
      // }

    } catch (error) {
      // No cached state or invalid, will register new client
    }
  }
}

// Usage example:
async function createMCPClient() {
  const client = new OAuthMCPClient({
    cacheDir: './.mcp-cache' // Optional custom cache directory
  });

  try {
    await client.initialize();
    console.log('MCP client initialized successfully');
    return client;
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    throw error;
  }
}

export default OAuthMCPClient;