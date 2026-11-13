import Link from "next/link";
import Puerta from "@/components/puerta";
import RecoveryForm from "./form";

export default function RecoveryPage() {
  return <Puerta>
    <h1 className="text-[22px] font-medium">Recuperar tu cuenta</h1>
    <p className="text-body">Usa el código que guardaste desde Ajustes. Sirve una sola vez y cierra todas tus sesiones.</p>
    <RecoveryForm />
    <p className="text-sm text-muted">Si no guardaste un código, no puedes recuperar la cuenta desde aquí. Una invitación no cambia tu clave.</p>
    <Link href="/entrar" className="touch-target inline-flex items-center underline">Volver a entrar</Link>
  </Puerta>;
}
