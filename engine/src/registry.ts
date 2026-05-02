import { createPublicClient, getAddress, http, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { namehash, normalize } from "viem/ens";

const TEXT_RECORD_PREFIX = "safeforge-npm";
const ROOT_DOMAIN = process.env.SAFEFORGE_NPM_BASE_DOMAIN ?? "safeforge-npm.eth";

const ENS_ADDRESSES = {
  registry: getAddress(process.env.ENS_REGISTRY_ADDRESS ?? "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"),
  publicResolver: getAddress(process.env.ENS_PUBLIC_RESOLVER_ADDRESS ?? "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"),
};

const ensRegistryAbi = [
  { type: "function", stateMutability: "view", name: "owner", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", stateMutability: "view", name: "resolver", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
] as const;

const publicResolverAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "text",
    inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export interface PublishedAuditStatus {
  found: boolean;
  verdict: string | null;
  score: number | null;
  reportUri: string | null;
  sourceUri: string | null;
  publishedAt: string | null;
  versionMatched: boolean;
  ensName: string | null;
  capabilities: string[];
}

function versionToLabel(version: string): string {
  return version.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function createRegistryClient() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL is required for registry reads");
  }

  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

async function readTextRecord(client: ReturnType<typeof createPublicClient>, node: `0x${string}`, key: string): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: ENS_ADDRESSES.publicResolver,
      abi: publicResolverAbi,
      functionName: "text",
      args: [node, key],
    });
    return value || null;
  } catch {
    return null;
  }
}

export function isRegistryReadConfigured(): boolean {
  return Boolean(process.env.SEPOLIA_RPC_URL);
}

export function isPublishConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT);
}

export function isRegistryWriteConfigured(): boolean {
  return Boolean(process.env.PINATA_JWT && process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_PRIVATE_KEY);
}

export async function readPublishedAuditStatus(packageName: string, version: string): Promise<PublishedAuditStatus> {
  const client = createRegistryClient();
  const parentName = `${packageName}.${ROOT_DOMAIN}`;
  const versionName = `${versionToLabel(version)}.${parentName}`;
  const node = namehash(normalize(versionName));

  const owner = await client.readContract({
    address: ENS_ADDRESSES.registry,
    abi: ensRegistryAbi,
    functionName: "owner",
    args: [node],
  });

  if (!owner || owner === zeroAddress) {
    return {
      found: false,
      verdict: null,
      score: null,
      reportUri: null,
      sourceUri: null,
      publishedAt: null,
      versionMatched: false,
      ensName: versionName,
      capabilities: [],
    };
  }

  const verdict = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.verdict`);
  const scoreRaw = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.score`);
  const reportUri = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.report_uri`);
  const sourceUri = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.source_uri`);
  const publishedAt = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.date`);
  const capabilitiesRaw = await readTextRecord(client, node, `${TEXT_RECORD_PREFIX}.capabilities`);

  return {
    found: Boolean(verdict || reportUri || sourceUri),
    verdict,
    score: scoreRaw && !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : null,
    reportUri,
    sourceUri,
    publishedAt,
    versionMatched: true,
    ensName: versionName,
    capabilities: capabilitiesRaw ? capabilitiesRaw.split(",").map((value) => value.trim()).filter(Boolean) : [],
  };
}
