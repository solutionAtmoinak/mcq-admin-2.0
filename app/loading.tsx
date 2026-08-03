

export default function Loading() {
    return (
        <div className="flex flex-2 flex-col items-center justify-center py-24">
            <svg xmlns="http://www.w3.org/2000/svg" width={64} height={64} viewBox="0 0 24 24">
                <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
                    <path strokeDasharray={32} d="M12 21c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9">
                        <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="32;0"></animate>
                    </path>
                    <path strokeDasharray="2 4" strokeDashoffset={6} d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9" opacity={0}>
                        <set fill="freeze" attributeName="opacity" begin="0.45s" to={1}></set>
                        <animateTransform fill="freeze" attributeName="transform" begin="0.45s" dur="0.6s" type="rotate" values="-180 12 12;0 12 12"></animateTransform>
                        <animate attributeName="stroke-dashoffset" begin="0.85s" dur="0.6s" repeatCount="indefinite" to={0}></animate>
                    </path>
                    <path strokeDasharray={10} strokeDashoffset={10} d="M12 8v7.5">
                        <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.85s" dur="0.2s" to={0}></animate>
                    </path>
                    <path strokeDasharray={8} strokeDashoffset={8} d="M12 15.5l3.5 -3.5M12 15.5l-3.5 -3.5">
                        <animate fill="freeze" attributeName="stroke-dashoffset" begin="1.05s" dur="0.2s" to={0}></animate>
                    </path>
                </g>
            </svg>
            <p className="text-2xl font-semibold text-[#171717] mt-6">Loading...</p>
        </div>
    )
}
