type ReownAuthProfile = {
  token: string;
  address?: string;
  email?: string;
  provider?: string;
};

const SOCIALS = ["email", "google", "x", "discord", "farcaster", "github", "apple", "facebook"];

const getProjectId = () =>
  import.meta.env.VITE_REOWN_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

const getChainConfig = () => {
  const chainId = Number.parseInt(import.meta.env.VITE_CHAIN_ID || "42161", 10);
  const rpcUrl = import.meta.env.VITE_CHAIN_RPC || "https://arbitrum.llamarpc.com";
  const name = import.meta.env.VITE_CHAIN_NAME || "Arbitrum One";
  const symbol = import.meta.env.VITE_CHAIN_SYMBOL || "ETH";

  return {
    chainId,
    rpcUrl,
    name,
    symbol,
  };
};

const storeAuthToken = (profile: ReownAuthProfile) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("auth", profile.token);
  if (profile.address) window.localStorage.setItem("reown_address", profile.address);
  if (profile.email) window.localStorage.setItem("reown_email", profile.email);
  if (profile.provider) window.localStorage.setItem("reown_provider", profile.provider);
};

const clearAuthToken = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("auth");
  window.localStorage.removeItem("reown_address");
  window.localStorage.removeItem("reown_email");
  window.localStorage.removeItem("reown_provider");
};

const ensureBufferPolyfill = async () => {
  if (typeof window === "undefined") return;
  const globalAny = globalThis as any;
  if (globalAny.Buffer) return;
  const { Buffer } = await import("buffer");
  globalAny.Buffer = Buffer;
};

export const initReownAppKit = async (onToken?: (token: string) => void) => {
  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[ReOwn] Missing VITE_REOWN_PROJECT_ID");
    return null;
  }

  const { chainId, rpcUrl, name, symbol } = getChainConfig();

  await ensureBufferPolyfill();

  const [{ createAppKit }, { EthersAdapter }, ethersModule] = await Promise.all([
    import("@reown/appkit/vue"),
    import("@reown/appkit-adapter-ethers"),
    import("ethers"),
  ]);

  const JsonRpcProvider =
    (ethersModule as any).JsonRpcProvider ||
    (ethersModule as any).providers?.JsonRpcProvider;

  if (!JsonRpcProvider) {
    throw new Error("ReOwn AppKit: JsonRpcProvider unavailable in ethers module");
  }

  const network = {
    id: chainId,
    name,
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };

  const adapter = new EthersAdapter({
    providers: [new JsonRpcProvider(rpcUrl, chainId)],
    chains: [network],
  });

  const appkit = createAppKit({
    adapters: [adapter],
    projectId,
    networks: [network],
    metadata: {
      name: "Flow Editor",
      description: "Trace Market flow editor",
      url: window.location.origin,
      icons: ["https://trace.market/favicon.ico"],
    },
    features: {
      analytics: true,
      socials: SOCIALS,
    },
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: true,
  });

  const controllers = await import("@reown/appkit-controllers");
  const { ChainController, CoreHelperUtil, AccountController, ConnectorController } = controllers;

  const handleProfile = async (caipAddress: string | undefined | null) => {
    const address = caipAddress ? CoreHelperUtil.getPlainAddress(caipAddress) : undefined;
    if (!address) {
      clearAuthToken();
      return;
    }

    let profile: ReownAuthProfile = { token: address, address };

    try {
      const authConnector = ConnectorController.getAuthConnector?.();
      if (authConnector && authConnector.provider) {
        const provider = authConnector.provider;
        const session = provider.session || provider.getSession?.();
        const user = session?.user || provider.user;

        if (user?.email) {
          profile = {
            token: user.email,
            address,
            email: user.email,
            provider: user.provider || user.issuer || "reown",
          };
        }
      }
    } catch (error) {
      console.warn("[ReOwn] Unable to read social profile", error);
    }

    storeAuthToken(profile);
    onToken?.(profile.token);
  };

  ChainController.subscribeKey("activeCaipAddress", handleProfile);

  if (AccountController?.subscribeKey) {
    AccountController.subscribeKey("isConnected", (isConnected: boolean) => {
      if (isConnected) {
        handleProfile(ChainController.state.activeCaipAddress);
      } else {
        clearAuthToken();
      }
    });

    if (AccountController.state?.isConnected) {
      handleProfile(ChainController.state.activeCaipAddress);
    }
  } else {
    handleProfile(ChainController.state.activeCaipAddress);
  }

  return appkit;
};

export const openReownModal = async () => {
  const { ModalController } = await import("@reown/appkit-controllers");
  ModalController.open();
};

export const getStoredAuthToken = () => {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem("auth");
  return token && token.trim() ? token : null;
};

export const getStoredEmail = () => {
  if (typeof window === "undefined") return null;
  const email = window.localStorage.getItem("reown_email");
  return email && email.trim() ? email : null;
};
