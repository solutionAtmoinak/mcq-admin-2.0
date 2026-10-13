import Link from "next/link";
import StatusScreen from "@/app/components/common/StatusScreen";
import { NotFoundIllustration } from "@/app/components/common/StatusIllustrations";
import { primaryButtonClass } from "@/app/components/common/ui";

export default function NotFound() {
  return (
    <StatusScreen
      illustration={<NotFoundIllustration />}
      eyebrow="Error 404"
      title="Page not found"
      message="The page you are looking for does not exist, was moved, or the link is incorrect."
    >
      <Link href="/" className={primaryButtonClass}>
        Go to home
      </Link>
    </StatusScreen>
  );
}
