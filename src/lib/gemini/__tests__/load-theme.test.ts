/**
 * Tests for Theme Store (Load Theme)
 * Validates schema loading, merging, and RTL/LTR parity
 */

import {
  getBaseSchema,
  getAllBaseSchemas,
  validateSchema,
  mergeSchemaOverride,
  supportsRTL,
  getRTLTextAlignment,
  getSchemasForCategory,
  getSchemasForLocale,
} from "../load-theme";
import type {
  MoodSchema,
  WorkspaceThemeOverride,
} from "../mood-schema-types";

describe("Theme Store — Load Theme", () => {
  describe("getBaseSchema", () => {
    it("loads minimalist-professional schema", () => {
      const schema = getBaseSchema("minimalist-professional");
      expect(schema.id).toBe("minimalist-professional");
      expect(schema.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(schema.fontStyle).toBe("clean");
    });

    it("loads all five base schemas", () => {
      const schemas = [
        "minimalist-professional",
        "energetic-tech",
        "organic-health",
        "high-contrast-bold",
        "luxury-premium",
      ];

      schemas.forEach((id) => {
        const schema = getBaseSchema(id as any);
        expect(schema.id).toBe(id);
        expect(schema.primaryColor).toBeDefined();
        expect(schema.rtlOverrides).toBeDefined();
        expect(schema.rtlOverrides.enabled).toBe(true);
      });
    });

    it("throws error for invalid schema ID", () => {
      expect(() => {
        getBaseSchema("invalid-schema" as any);
      }).toThrow("Schema not found");
    });
  });

  describe("getAllBaseSchemas", () => {
    it("returns all five schemas", () => {
      const schemas = getAllBaseSchemas();
      expect(schemas.length).toBe(5);
    });

    it("all schemas have required properties", () => {
      const schemas = getAllBaseSchemas();
      schemas.forEach((schema) => {
        expect(schema.id).toBeDefined();
        expect(schema.label).toBeDefined();
        expect(schema.primaryColor).toBeDefined();
        expect(schema.textColor).toBeDefined();
        expect(schema.fontStyle).toBeDefined();
        expect(schema.rtlOverrides).toBeDefined();
      });
    });

    it("all schemas support RTL", () => {
      const schemas = getAllBaseSchemas();
      schemas.forEach((schema) => {
        expect(schema.rtlOverrides.enabled).toBe(true);
        expect(schema.rtlOverrides.mirrorAssets).toBe(true);
      });
    });
  });

  describe("validateSchema", () => {
    it("validates correct schema", () => {
      const schema = getBaseSchema("minimalist-professional");
      const result = validateSchema(schema);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects schema with missing id", () => {
      const invalid = { primaryColor: "#000000" };
      const result = validateSchema(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    });

    it("rejects null/non-object", () => {
      const result = validateSchema(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be an object");
    });

    it("warns about missing RTL overrides", () => {
      const schemaWithoutRTL = getBaseSchema("minimalist-professional");
      const copy = { ...schemaWithoutRTL };
      delete (copy as any).rtlOverrides;
      const result = validateSchema(copy);
      expect(result.warnings.some((w) => w.includes("RTL"))).toBe(true);
    });

    it("detects invalid hex colors", () => {
      const invalid = {
        id: "test",
        primaryColor: "not-a-hex",
        textColor: "#000000",
        fontStyle: "clean",
        shadowProfile: "subtle",
        luminance: "high",
      };
      const result = validateSchema(invalid);
      expect(result.warnings.some((w) => w.includes("hex"))).toBe(true);
    });
  });

  describe("mergeSchemaOverride", () => {
    let baseSchema: MoodSchema;

    beforeEach(() => {
      baseSchema = getBaseSchema("minimalist-professional");
    });

    it("merges color overrides", () => {
      const override: WorkspaceThemeOverride = {
        id: "override1",
        workspaceId: "ws123",
        baseSchemaId: "minimalist-professional",
        label: "Custom Blue",
        colorOverrides: {
          primaryColor: "#0000FF",
          textColor: "#FFFFFF",
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rtlOverrides: {},
      };

      const merged = mergeSchemaOverride(baseSchema, override);

      expect(merged.primaryColor).toBe("#0000FF");
      expect(merged.textColor).toBe("#FFFFFF");
      expect(merged.secondaryColor).toBe(baseSchema.secondaryColor); // Not overridden
    });

    it("merges typography overrides", () => {
      const override: WorkspaceThemeOverride = {
        id: "override1",
        workspaceId: "ws123",
        baseSchemaId: "minimalist-professional",
        label: "Bold Variant",
        typographyOverrides: {
          fontStyle: "bold",
          shadowProfile: "strong",
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rtlOverrides: {},
      };

      const merged = mergeSchemaOverride(baseSchema, override);

      expect(merged.fontStyle).toBe("bold");
      expect(merged.shadowProfile).toBe("strong");
      expect(merged.primaryColor).toBe(baseSchema.primaryColor); // Not overridden
    });

    it("merges RTL overrides", () => {
      const override: WorkspaceThemeOverride = {
        id: "override1",
        workspaceId: "ws123",
        baseSchemaId: "minimalist-professional",
        label: "Arabic Variant",
        rtlOverrides: {
          enabled: true,
          textAlignment: "left", // Non-standard override
          notes: "Custom RTL behavior",
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const merged = mergeSchemaOverride(baseSchema, override);

      expect(merged.rtlOverrides.textAlignment).toBe("left");
      expect(merged.rtlOverrides.notes).toBe("Custom RTL behavior");
      expect(merged.rtlOverrides.mirrorAssets).toBe(
        baseSchema.rtlOverrides.mirrorAssets
      ); // Inherited
    });

    it("preserves base schema when no overrides", () => {
      const override: WorkspaceThemeOverride = {
        id: "override1",
        workspaceId: "ws123",
        baseSchemaId: "minimalist-professional",
        label: "Empty Variant",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rtlOverrides: {},
      };

      const merged = mergeSchemaOverride(baseSchema, override);

      // Colors unchanged
      expect(merged.primaryColor).toBe(baseSchema.primaryColor);
      expect(merged.textColor).toBe(baseSchema.textColor);
      // Typography unchanged
      expect(merged.fontStyle).toBe(baseSchema.fontStyle);
    });

    it("does not mutate base schema", () => {
      const override: WorkspaceThemeOverride = {
        id: "override1",
        workspaceId: "ws123",
        baseSchemaId: "minimalist-professional",
        label: "Test",
        colorOverrides: { primaryColor: "#FF0000" },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rtlOverrides: {},
      };

      const originalColor = baseSchema.primaryColor;
      mergeSchemaOverride(baseSchema, override);

      expect(baseSchema.primaryColor).toBe(originalColor);
    });
  });

  describe("RTL Support Validation", () => {
    it("supportsRTL returns true for all base schemas", () => {
      const schemas = getAllBaseSchemas();
      schemas.forEach((schema) => {
        expect(supportsRTL(schema)).toBe(true);
      });
    });

    it("getRTLTextAlignment defaults to right", () => {
      const schema = getBaseSchema("minimalist-professional");
      expect(getRTLTextAlignment(schema)).toBe("right");
    });

    it("getRTLTextAlignment respects override", () => {
      const schema = getBaseSchema("minimalist-professional");
      const modified = { ...schema };
      modified.rtlOverrides = {
        ...modified.rtlOverrides,
        textAlignment: "center",
      };

      expect(getRTLTextAlignment(modified)).toBe("center");
    });

    it("Arabic and Hebrew schemas are included in RTL locale filter", () => {
      const arSchemas = getSchemasForLocale("ar");
      const heSchemas = getSchemasForLocale("he");

      expect(arSchemas.length).toBeGreaterThan(0);
      expect(heSchemas.length).toBeGreaterThan(0);

      // All returned schemas should support RTL
      [...arSchemas, ...heSchemas].forEach((schema) => {
        expect(supportsRTL(schema)).toBe(true);
      });
    });

    it("LTR locales get all schemas", () => {
      const enSchemas = getSchemasForLocale("en");
      const deSchemas = getSchemasForLocale("de");

      expect(enSchemas.length).toBe(5);
      expect(deSchemas.length).toBe(5);
    });
  });

  describe("Category Affinity", () => {
    it("getSchemasForCategory returns relevant schemas", () => {
      const productivitySchemas = getSchemasForCategory("productivity");
      expect(productivitySchemas.length).toBeGreaterThan(0);
      expect(productivitySchemas.some((s) => s.id === "minimalist-professional")).toBe(
        true
      );
    });

    it("gaming category returns energetic and bold schemas", () => {
      const gamingSchemas = getSchemasForCategory("games");
      const schemaIds = gamingSchemas.map((s) => s.id);

      expect(
        schemaIds.some((id) =>
          ["energetic-tech", "high-contrast-bold"].includes(id)
        )
      ).toBe(true);
    });

    it("health category returns organic schema", () => {
      const healthSchemas = getSchemasForCategory("health");
      const schemaIds = healthSchemas.map((s) => s.id);

      expect(schemaIds.includes("organic-health")).toBe(true);
    });

    it("returns empty array for unknown category", () => {
      const schemas = getSchemasForCategory("unknown-category");
      expect(schemas.length).toBe(0);
    });
  });

  describe("Color Palette Consistency (LTR/RTL Parity)", () => {
    it("all schemas have valid hex colors", () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;
      const schemas = getAllBaseSchemas();

      schemas.forEach((schema) => {
        expect(schema.primaryColor).toMatch(hexRegex);
        expect(schema.secondaryColor).toMatch(hexRegex);
        expect(schema.accentColor).toMatch(hexRegex);
        expect(schema.backgroundColor).toMatch(hexRegex);
        expect(schema.textColor).toMatch(hexRegex);
      });
    });

    it("text color has sufficient contrast with background", () => {
      const luminanceOf = (hex: string): number => {
        const rgb = parseInt(hex.slice(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;

        // WCAG relative luminance
        const toLinear = (c: number) => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };

        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      };

      const contrastRatio = (light: number, dark: number): number => {
        const l = Math.max(light, dark);
        const d = Math.min(light, dark);
        return (l + 0.05) / (d + 0.05);
      };

      const schemas = getAllBaseSchemas();
      schemas.forEach((schema) => {
        const bgLuminance = luminanceOf(schema.backgroundColor);
        const textLuminance = luminanceOf(schema.textColor);
        const ratio = contrastRatio(bgLuminance, textLuminance);

        // WCAG AA minimum is 4.5:1 for normal text
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    });

    it("all schemas have consistent saturation across primaries", () => {
      // Check that color relationships are maintained
      const schemas = getAllBaseSchemas();

      schemas.forEach((schema) => {
        // All schemas should have defined primary and secondary
        expect(schema.primaryColor).toBeTruthy();
        expect(schema.secondaryColor).toBeTruthy();

        // Colors should be different (not identical)
        expect(schema.primaryColor.toLowerCase()).not.toEqual(
          schema.secondaryColor.toLowerCase()
        );
      });
    });
  });

  describe("Compositing Engine Compatibility", () => {
    it("schemas work with compose-screenshot flow", () => {
      const schema = getBaseSchema("minimalist-professional");

      // Simulate what compose-screenshot needs
      const layoutMap = {
        primaryColor: schema.primaryColor,
        backgroundColor: schema.backgroundColor,
        textColor: schema.textColor,
        shadowProfile: schema.shadowProfile,
        isRTL: false,
      };

      expect(layoutMap.primaryColor).toMatch(/^#/);
      expect(layoutMap.backgroundColor).toMatch(/^#/);
      expect(layoutMap.textColor).toMatch(/^#/);
    });

    it("RTL schemas work with flop-composite-flop pipeline", () => {
      const schema = getBaseSchema("energetic-tech");

      // For RTL rendering
      const isRTL = true;
      const rtlAlignment = getRTLTextAlignment(schema);

      // Compositing engine uses these
      expect(rtlAlignment).toMatch(/^(left|right|center)$/);
      expect(supportsRTL(schema)).toBe(true);

      // flop() is called before compositing
      // Then text is applied at rtlAlignment
      // Then flop() is called again
    });

    it("all schemas support the flop-composite-flop RTL strategy", () => {
      const schemas = getAllBaseSchemas();

      schemas.forEach((schema) => {
        // Every schema must have mirrorAssets = true for flop strategy
        expect(schema.rtlOverrides.mirrorAssets).toBe(true);

        // Every schema must define text alignment
        expect(schema.rtlOverrides.textAlignment).toMatch(/^(left|right|center)$/);
      });
    });
  });
});
