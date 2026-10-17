"use client";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-11 rounded-lg bg-green-600 px-5 font-medium text-white"
    >
      Reintentar
    </button>
  );
}
