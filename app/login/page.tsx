import Image from "next/image";
import { Suspense } from "react";
import { JwtQueryLogin } from "./JwtQueryLogin";
import { LoginButton } from "./LoginButton";

const LoginPage = () => {
    return (
        <div className="flex flex-col items-center">
            <Suspense fallback={null}>
                <JwtQueryLogin />
            </Suspense>
            <Image src='/logo-dth.png' alt="logo" width={500} height={250} className="mx-auto bg-linear-to-br from-teal-100 via-pink-100 to-amber-100 rounded-lg" loading="eager" />
            <LoginButton />
        </div>
    )
}

export default LoginPage
