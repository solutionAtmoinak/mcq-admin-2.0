import React from 'react'

const Loading = () => {
    return (
        <section className="flex min-w-0 flex-1 flex-col justify-center items-center h-screen">
            <div className="loader"></div>
            <p className='mt-8 font-semibold text-2xl text-zinc-900'>Loading ...</p>
        </section>
    )
}

export default Loading

