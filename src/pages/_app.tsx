import "../styles/globals.css";
import type { AppProps } from "next/app";
import { CacheProvider, EmotionCache } from "@emotion/react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import createEmotionCache from "@/lib/emotion";
import { theme } from "@/theme";

export interface MyAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

const clientSideCache = createEmotionCache();

export default function App({
  Component,
  pageProps,
  emotionCache = clientSideCache,
}: MyAppProps) {
  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Component {...pageProps} />
      </ThemeProvider>
    </CacheProvider>
  );
}
