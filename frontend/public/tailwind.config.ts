interface TailwindPluginApi {
  addUtilities: (utilities: Record<string, Record<string, string>>) => void;
  addVariant: (name: string, variant: string) => void;
  theme: (path: string) => string;
}

export default {
  content: {
    relative: true,
    files: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  },
  theme: {
    extend: {
      colors: {
        public: {
          brand: "#173d2b",
          eyebrow: "#5a8b71",
          heading: "#18392a",
          "event-title": "#22392d",
          muted: "var(--ui-muted)",
        },
      },
      fontSize: {
        "event-heading": "1.15rem",
        "participant-heading": "1.45rem",
      },
      lineHeight: {
        public: "1.7",
      },
      maxWidth: {
        "participant-form": "480px",
      },
      spacing: {
        "mobile-content": "34px",
      },
    },
  },
  plugins: [
    ({ addUtilities, addVariant, theme }: TailwindPluginApi) => {
      addVariant("public-mobile", "@media (max-width: 700px)");
      addVariant("participant-name-missing", "body.needs-participant-name &");
      addUtilities({
        ".public-shell": {
          width: "calc(100% - 2.5rem)",
          maxWidth: "1080px",
          marginInline: "auto",
        },
        ".public-header": {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--ui-border)",
          paddingBlock: "26px",
        },
        ".public-brand": {
          color: theme("colors.public.brand"),
          fontSize: "1.1rem",
          fontWeight: "700",
          textDecoration: "none",
        },
        ".public-content": {
          paddingTop: "52px",
          paddingBottom: "80px",
        },
        ".public-hero": {
          marginBottom: "28px",
        },
        ".public-eyebrow": {
          margin: "0 0 8px",
          color: theme("colors.public.eyebrow"),
          fontSize: "12px",
          fontWeight: "700",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        },
        ".public-title": {
          margin: "0",
          color: theme("colors.public.heading"),
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          letterSpacing: "-0.05em",
        },
        ".public-description": {
          maxWidth: "560px",
          marginTop: "12px",
          marginBottom: "0",
          color: theme("colors.public.muted"),
          lineHeight: theme("lineHeight.public"),
        },
        ".public-event-list": {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "16px",
          padding: "0",
          listStyle: "none",
        },
        ".public-ticket-list": {
          display: "grid",
          gap: "12px",
          padding: "0",
          listStyle: "none",
        },
        ".public-ticket-row": {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          border: "1px solid var(--ui-border)",
          borderRadius: "12px",
          backgroundColor: "#fff",
          padding: "17px 20px",
        },
      });
    },
  ],
};
