/** Typography for long-form MDX: the legal documents and the guides share one style. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article
      className="prose prose-invert prose-slate max-w-none
      prose-headings:text-white prose-headings:font-semibold
      prose-h1:text-3xl prose-h1:sm:text-4xl prose-h1:mb-4
      prose-h2:mt-12 prose-h2:text-xl prose-h2:sm:text-2xl
      prose-h3:mt-8 prose-h3:text-lg
      prose-p:text-slate-300 prose-li:text-slate-300
      prose-strong:text-white
      prose-a:text-blue-400 prose-a:font-normal hover:prose-a:text-blue-300
      prose-table:text-slate-300 prose-th:text-white
      prose-code:text-blue-300 prose-code:before:content-none prose-code:after:content-none
      prose-hr:border-slate-800"
    >
      {children}
    </article>
  );
}
