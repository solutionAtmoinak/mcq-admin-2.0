'use client'

import { useRouter } from "next/navigation";
import { FaHome } from "react-icons/fa";
import { clearAuthCookie, getAuthCookie, validateWithLms } from "../lib/auth/auth";

export function LoginButton() {
    const router = useRouter();
    async function handleLogin() {
        const token = await getAuthCookie();

        if (!!token) {
            const isValid = await validateWithLms(token);
            if (isValid) {
                router.replace('/')
            } else {
                await clearAuthCookie();
                router.replace('https://proweb.dthlms.com/auth/login')
            }
        } else {
            router.replace('https://proweb.dthlms.com');
        }

    }

    return (
        <button onClick={handleLogin} className="p-0.75 relative cursor-pointer mt-8 mx-auto">
            <div className="absolute inset-0 bg-linear-to-r from-indigo-500 to-purple-500 rounded-lg" />
            <div className="px-8 py-2  bg-black rounded-md  relative group transition duration-200 text-white hover:bg-transparent flex gap-x-4 items-center font-semibold">
                <FaHome className='size-6' />
                Login With DthLMS
            </div>
        </button>
    )
}
