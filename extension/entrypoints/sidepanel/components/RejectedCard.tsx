/** /ask refused the question (4xx): say so and show the backend's reason. */
export function RejectedCard({ detail }: { detail: string }) {
  return (
    <article className="card2">
      <p className="ans">Couldn't read that question</p>
      <p className="sub">{detail}</p>
    </article>
  );
}
