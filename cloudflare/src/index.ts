import { Container } from "@cloudflare/containers";

export class AssppContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "2h";
  enableInternet = true;
  pingEndpoint = "/api/settings";
  envVars = {
    DATA_DIR: "/data",
    NODE_ENV: "production",
    PORT: "8080",
  };
}

interface Env {
  ASPP_CONTAINER: ContainerNamespace;
  CONTAINER_INSTANCE_NAME?: string;
}

interface ContainerInstance {
  fetch(request: Request): Promise<Response>;
  startAndWaitForPorts(): Promise<void>;
}

interface ContainerNamespace {
  getByName(name: string): ContainerInstance;
}

function withForwardHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  if (!headers.has("x-forwarded-proto")) {
    // Default to HTTPS when the header is missing to avoid local dev redirects.
    headers.set("x-forwarded-proto", "https");
  }
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const containerName = env.CONTAINER_INSTANCE_NAME?.trim() || "main";
    const container = env.ASPP_CONTAINER.getByName(containerName);
    await container.startAndWaitForPorts();
    return container.fetch(withForwardHeaders(request));
  },
};
