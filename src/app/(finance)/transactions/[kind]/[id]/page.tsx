import TransactionDetail from "./workspace";
export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) { const { kind,id } = await params; return <TransactionDetail kind={kind} id={id} />; }
