const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-s-8 text-center">
      <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
        signal lost
      </p>
      <h1 className="mt-s-3 font-mono text-[clamp(4rem,3rem+6vw,9rem)] font-[700] leading-none tracking-[-0.04em] text-[var(--text-hi)]">
        404
      </h1>
      <div className="mt-s-4 flex items-center gap-s-3">
        <span
          aria-hidden
          className="inline-block h-px w-12 bg-[var(--accent)]"
        />
        <p className="text-fs-body text-[var(--text-md)]">Page not found</p>
        <span
          aria-hidden
          className="inline-block h-px w-12 bg-[var(--accent)]"
        />
      </div>
      <a
        href="/"
        className="mt-s-8 inline-flex items-center gap-s-2 rounded-r-2 px-s-4 py-s-2 font-mono text-fs-label uppercase tracking-[0.06em] text-[var(--text-md)] transition-colors hover:text-[var(--accent)]"
      >
        Go back to dashboard
      </a>
    </div>
  );
};

export default NotFound;
