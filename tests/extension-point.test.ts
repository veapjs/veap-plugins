import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindPluginsContext } from "../src/common";
import { PluginExtensionPoint } from "../src/widgets";

vi.mock("@veap/auth", () => ({
  getCurrentSession: vi.fn().mockResolvedValue({ user: null }),
}));

describe("PluginExtensionPoint component", () => {
  const mockExtensions = {
    getExtensions: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    bindPluginsContext({
      registry: {} as any,
      extensions: mockExtensions as any,
      navigation: {} as any,
    });
  });

  it("renders fallback when no extensions are registered", async () => {
    mockExtensions.getExtensions.mockResolvedValue([]);

    const result = await PluginExtensionPoint({
      target: "core",
      point: "header",
      fallback: "Fallback Content",
    });

    expect(result).toBe("Fallback Content");
  });

  it("renders children when no extensions are registered", async () => {
    mockExtensions.getExtensions.mockResolvedValue([]);

    const result = await PluginExtensionPoint({
      target: "core",
      point: "header",
      children: "Children Content",
    });

    expect(result).toBe("Children Content");
  });

  it("renders single extension when mode is single", async () => {
    const DummyComponent = () => "Mocked Component Output";
    mockExtensions.getExtensions.mockResolvedValue([
      {
        id: "ext-1",
        component: DummyComponent,
      },
    ]);

    const result = (await PluginExtensionPoint({
      target: "core",
      point: "header",
      mode: "single",
    })) as React.ReactElement;

    expect(React.isValidElement(result)).toBe(true);
    expect(result.type).toBe(DummyComponent);
  });

  it("renders multiple extensions in a wrapper div by default", async () => {
    const Dummy1 = () => "Output 1";
    const Dummy2 = () => "Output 2";
    mockExtensions.getExtensions.mockResolvedValue([
      { id: "ext-1", component: Dummy1 },
      { id: "ext-2", component: Dummy2 },
    ]);

    const result = (await PluginExtensionPoint({
      target: "core",
      point: "header",
      className: "test-container",
    })) as React.ReactElement;

    expect(React.isValidElement(result)).toBe(true);
    expect(result.type).toBe("div");
    expect(result.props.className).toBe("test-container");
    expect(result.props.children).toHaveLength(2);
  });
});
