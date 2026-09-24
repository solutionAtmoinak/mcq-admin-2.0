"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
            if (cancelled) return;
            router.replace(res.ok ? '/' : '/login');
        })();

        return () => {
            cancelled = true;
        };
    }, [jwt, router]);

    return null;
}
