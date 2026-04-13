import os
import json
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from mcp import ClientSession, stdio_client

class OAuthMCPClient:
    def __init__(self, cache_dir: Optional[str] = None):
        self.cache_dir = Path(cache_dir or ".mcp-cache")
        self.client_id_file = self.cache_dir / "client_id.json"
        self.token_file = self.cache_dir / "tokens.json"
        self.client_id: Optional[str] = None
        self.session: Optional[ClientSession] = None

    async def complete_oauth(self, code: str, state: str) -> None:
        """Handle OAuth completion with error recovery for invalid client IDs"""
        try:
            if self.session:
                # Use the session's OAuth completion method
                await self.session.complete_oauth(code, state)
        except Exception as error:
            if self._is_invalid_client_id_error(error):
                print("Invalid client ID detected. Resetting client state and re-registering...")
                await self._reset_client_state()
                await self._register_client()
                # Retry with new client ID
                await self.session.complete_oauth(code, state)
            else:
                raise error

    def _is_invalid_client_id_error(self, error: Exception) -> bool:
        """Check if error is due to invalid/expired client ID"""
        error_message = str(error).lower()
        return ('client_id' in error_message and
                any(keyword in error_message for keyword in ['invalid', 'expired', 'not found']))

    async def _reset_client_state(self) -> None:
        """Reset client state by clearing cached files"""
        try:
            # Ensure cache directory exists
            self.cache_dir.mkdir(parents=True, exist_ok=True)

            # Remove cached files
            files_to_remove = [self.client_id_file, self.token_file]
            for file_path in files_to_remove:
                if file_path.exists():
                    file_path.unlink()

            print("Client state reset successfully")
        except Exception as error:
            print(f"Failed to reset client state: {error}")
            raise error

    async def _register_client(self) -> None:
        """Register client and store new client ID"""
        try:
            # Clear existing client ID
            self.client_id = None

            # This would typically make an HTTP request to your MCP server's register endpoint
            # For this example, we'll simulate the registration
            registration_data = {
                "client_name": "MCP OAuth Client",
                "redirect_uris": ["http://localhost:3000/oauth/callback"],
                "scope": "read write"
            }

            # Simulate API call - replace with actual HTTP request
            # response = await self._make_registration_request(registration_data)
            response = {"client_id": f"mcp-client-{os.urandom(8).hex()}"}  # Simulated

            self.client_id = response["client_id"]

            # Cache the new client ID
            client_data = {
                "client_id": self.client_id,
                "created_at": asyncio.get_event_loop().time()
            }

            async with aiofiles.open(self.client_id_file, 'w') as f:
                await f.write(json.dumps(client_data, indent=2))

            print(f"Client registered successfully with ID: {self.client_id}")
        except Exception as error:
            print(f"Failed to register client: {error}")
            raise error

    async def initialize(self) -> None:
        """Initialize client with automatic state recovery"""
        try:
            # Try to load cached client ID
            await self._load_cached_state()

            # Initialize MCP session
            # This is a simplified example - adapt to your actual MCP setup
            async with stdio_client(["your-mcp-server"]) as (read, write):
                async with ClientSession(read, write) as session:
                    self.session = session
                    await session.initialize()

        except Exception as error:
            if self._is_invalid_client_id_error(error):
                print("Cached client ID invalid. Resetting and re-registering...")
                await self._reset_client_state()
                await self._register_client()
                # Retry initialization
                await self.initialize()
            else:
                raise error

    async def _load_cached_state(self) -> None:
        """Load cached client state"""
        try:
            if self.client_id_file.exists():
                async with aiofiles.open(self.client_id_file, 'r') as f:
                    data = json.loads(await f.read())
                    self.client_id = data["client_id"]

                    # Optional: check expiration (24 hours example)
                    # created_at = data.get("created_at", 0)
                    # if asyncio.get_event_loop().time() - created_at > 24 * 60 * 60:
                    #     raise ValueError("Client ID expired")

        except (FileNotFoundError, json.JSONDecodeError):
            # No cached state, will register new client
            pass

    async def _make_registration_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Make actual HTTP request to register client - implement based on your server"""
        # Example using aiohttp:
        # async with aiohttp.ClientSession() as session:
        #     async with session.post("https://your-mcp-server/register", json=data) as response:
        #         return await response.json()
        raise NotImplementedError("Implement actual registration API call")


# Usage example
async def create_mcp_client():
    client = OAuthMCPClient(cache_dir="./.mcp-cache")

    try:
        await client.initialize()
        print("MCP client initialized successfully")
        return client
    except Exception as error:
        print(f"Failed to initialize MCP client: {error}")
        raise error


if __name__ == "__main__":
    asyncio.run(create_mcp_client())