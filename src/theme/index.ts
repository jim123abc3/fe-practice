import { Palette } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface TypographyVariants {
    interMd: React.CSSProperties;
    drukMd: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    interMd: React.CSSProperties;
    drukMd: React.CSSProperties;
  }
  interface Palette {
    brand: Palette["primary"];
  }
  interface PaletteOptions {
    brand?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    interMd: true;
    drukMd: true;
    h3: false;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    primary: true;
  }
}

export const theme = createTheme({
  palette: { brand: { main: "#83F235" } },
  typography: { interMd: {}, drukMd: {} },
  components: {
    MuiTypography: {
      defaultProps: { variantMapping: { interMd: "span", drukMd: "h2" } },
    },
  },
});
