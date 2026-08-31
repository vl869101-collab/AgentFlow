import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import TemplatesMarketplacePage from "../src/app/templates/page";
import { TemplatePreviewModal } from "../src/components/templates/TemplatePreviewModal";
import type { WorkflowTemplateDto } from "../src/lib/api";

// Mock do next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
  usePathname: () => "/templates",
}));

// Mock dos ícones Lucide
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const DummyIcon = (props: any) => <span data-testid="icon" {...props} />;
  return {
    ...actual,
    Workflow: DummyIcon,
    Sparkles: DummyIcon,
    Layers: DummyIcon,
    Brain: DummyIcon,
    Target: DummyIcon,
    Headphones: DummyIcon,
    ShieldAlert: DummyIcon,
    ShoppingCart: DummyIcon,
    Zap: DummyIcon,
    Clock: DummyIcon,
    Download: DummyIcon,
    Upload: DummyIcon,
    Search: DummyIcon,
    CheckCircle2: DummyIcon,
    X: DummyIcon,
    Eye: DummyIcon,
  };
});

// Mock do @xyflow/react para o canvas preview
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children, nodes, edges }: any) => (
    <div data-testid="react-flow-mock">
      <span>Nodes: {nodes?.length}</span>
      <span>Edges: {edges?.length}</span>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  Background: () => <div data-testid="rf-background" />,
  Controls: () => <div data-testid="rf-controls" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  BackgroundVariant: { Dots: "dots" },
  useReactFlow: () => ({
    screenToFlowPosition: (pos: any) => pos,
  }),
}));

const mockTemplate: WorkflowTemplateDto = {
  id: "rag-document-intelligence",
  name: "RAG & Document Intelligence",
  description: "Ingestão inteligente de PDFs e documentos do Google Drive, vetorização automática e agente de Q&A.",
  category: "IA & RAG",
  tags: ["RAG", "Embeddings", "Google Drive"],
  color: "#a855f7",
  connectors: ["googleDrive", "vector_store", "ai_agent"],
  difficulty: "Avançado",
  estimatedSetupMinutes: 5,
  featured: true,
  workflow: {
    name: "RAG & Document Intelligence Assistant",
    description: "Pipeline automatizado de RAG",
    nodes: [
      { id: "n1", type: "trigger", label: "Google Drive Ingest", position: { x: 0, y: 0 } },
      { id: "n2", type: "advanced", label: "VectorStore Index", position: { x: 200, y: 0 } },
      { id: "n3", type: "action", label: "AI Q&A Agent", position: { x: 400, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
};

// Mock da api de templates
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    templatesApi: {
      list: vi.fn().mockResolvedValue({
        total: 1,
        categories: ["Todas", "IA & RAG", "Vendas & CRM"],
        templates: [mockTemplate],
      }),
      clone: vi.fn().mockResolvedValue({
        id: "wf-cloned-123",
        name: "RAG & Document Intelligence",
      }),
      import: vi.fn().mockResolvedValue({
        id: "wf-imported-123",
        name: "Imported Workflow",
      }),
      exportUrl: vi.fn().mockReturnValue("http://localhost:3001/api/templates/rag-document-intelligence/export"),
    },
  };
});

describe("Frontend Workflow Templates & Marketplace UI", () => {
  it("deve renderizar a galeria de templates com os cards e categorias", async () => {
    render(<TemplatesMarketplacePage />);

    expect(screen.getByText("Biblioteca de Templates de Workflows")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("RAG & Document Intelligence")).toBeDefined();
    });

    expect(screen.getByText("IA & RAG")).toBeDefined();
  });

  it("deve renderizar o modal de pré-visualização com grafo React Flow em modo leitura", () => {
    const onCloneMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <TemplatePreviewModal
        template={mockTemplate}
        isOpen={true}
        onClose={onCloseMock}
        onUseTemplate={onCloneMock}
        cloning={false}
      />
    );

    expect(screen.getByText("RAG & Document Intelligence")).toBeDefined();
    expect(screen.getByTestId("react-flow-mock")).toBeDefined();
    expect(screen.getByText("Nodes: 3")).toBeDefined();
    expect(screen.getByText("Edges: 2")).toBeDefined();

    const useTemplateBtn = screen.getByText("Usar Este Template");
    fireEvent.click(useTemplateBtn);
    expect(onCloneMock).toHaveBeenCalledWith(mockTemplate);
  });
});
