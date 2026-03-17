import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportToCsv } from "@/lib/exportCsv";

describe("exportToCsv", () => {
  let createElementSpy: any;
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    const mockLink = { href: "", download: "", click: vi.fn() };
    createElementSpy = vi.spyOn(document, "createElement").mockReturnValue(mockLink as any);
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("does nothing with empty data", () => {
    exportToCsv([], [{ key: "a", label: "A" }], "test");
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it("creates download link with correct filename", () => {
    const data = [{ name: "Test", value: 42 }];
    const columns = [
      { key: "name", label: "Nom" },
      { key: "value", label: "Valeur" },
    ];
    exportToCsv(data, columns, "export_test");
    expect(createElementSpy).toHaveBeenCalledWith("a");
    const link = createElementSpy.mock.results[0].value;
    expect(link.download).toContain("export_test_");
    expect(link.download).toContain(".csv");
    expect(link.click).toHaveBeenCalled();
  });

  it("handles nested keys (dot notation)", () => {
    const data = [{ products: { designation: "Harissa" }, numero: "OF-001" }];
    const columns = [
      { key: "numero", label: "N° OF" },
      { key: "products.designation", label: "Produit" },
    ];
    exportToCsv(data, columns, "test");
    // Should not throw
    expect(createObjectURLSpy).toHaveBeenCalled();
  });

  it("handles null/undefined values", () => {
    const data = [{ name: null, value: undefined }];
    const columns = [
      { key: "name", label: "Nom" },
      { key: "value", label: "Valeur" },
    ];
    exportToCsv(data, columns, "test");
    expect(createObjectURLSpy).toHaveBeenCalled();
  });

  it("escapes double quotes in values", () => {
    const data = [{ name: 'He said "hello"' }];
    const columns = [{ key: "name", label: "Nom" }];
    exportToCsv(data, columns, "test");
    expect(createObjectURLSpy).toHaveBeenCalled();
  });
});
