// Renders a JSON-LD structured-data block. The `<` escaping prevents a
// "</script>" in any field (e.g. a product name) from breaking out of the tag.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
