"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";

export function JwtQueryLogin() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const jwt = searchParams.get('jwt');

    useEffect(() => {
        if (!jwt) return;

        let cancelled = false;
        (async () => {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jwt }),
            });
            if (!res.ok) {
                const json = await res.json();
                toast(json.error, { type: 'error', });
            }
            if (cancelled) return;
            router.replace(res.ok ? '/' : '/login');
        })();

        return () => {
            cancelled = true;
        };
    }, [jwt, router]);

    return null;
}
