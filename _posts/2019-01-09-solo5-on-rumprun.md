---
layout: post
title:  "Rumprun on Solo5"
date:   2018-01-12
tags: rumprun solo5 ukvm
author: ricarkol
---

This blog entry describes the rumprun architecture and how solo5 was integrated
to it.

There is a description of rumpkernels and rumprun [here]({{ site.baseurl }}{% post_url 16-08-16-login-rump-kernels %}).
As a quick introduction, let's actually use rumprun. This will help as a very high level introduction
to rumprun and as a way of pointing to the
pieces relevant to solo5. Let's say you have a hello.c application like this:

```
#include <stdio.h>
int main() {
	printf("Hello, Rumprun!\n");
}
```

You could compile+link this app to run on your system (`gcc -o hello hello.c`),
or create a unikernel VM ready to run on QEMU using the rumprun building tools:

```
$ x86_64-rumprun-netbsd-gcc -o hello hello.c
$ rumprun-bake hw-virtio hello.bin hello
```

The second step, the baking, links your application to a rumprun libc
instead of the regular libc on your system.
This rumprun libc is statically linked to an unmodified portion of the netbsd kernel (via the anykernel architecture).
By doing this, you are using a statically compiled library OS instead of the regular Linux kernel accessible
through syscalls. The `hw-virtio` argument instructs `rumprun-bake` to link against a driver library
for booting on x86, and a set of `virtio` drivers for block and network virtual devices.

As a high level goal, we want to be able to bake against a set of `solo5-ukvm` libraries so we can
boot on ukvm-bin, and use ukvm devices (through the solo5 interface). Basically, we want to be able
to do this:

```
$ x86_64-rumprun-netbsd-gcc -o hello hello.c
$ rumprun-bake solo5-ukvm hello.ukvm hello
$ ./ukvm-bin hello.ukvm
Hello, Rumprun!
$
```

### The rumprun architecture

![rumprun-architecture.png]({{"public/img/rumprun-architecture.png" | relative_url}})

This is the "official" architecture figure from the rumpkernel [book](http://book.rumpkernel.org/).
Let's tie it to the hello.c example presented above. The unmodified POSIX userspace code is `hello.c`,
or any of [these](https://github.com/rumpkernel/rumprun-packages). Rumprun libc is the libc box
that uses "rump kernel calls" instead of "syscall traps". The "bare metal kernel" (bmk) box
at the bottom is the one that's specific to each backend: Xen, KVM, or regular HW. This bmk layer
is precisely where solo5 support is implemented. As you saw above, which backend to use is defined
by the first argument to `rumprun-bake` above.


### How to fit solo5 in there?

The following figure shows the two bottom layers from the previous architecture one:

![solo5-rumprun-slide]({{"public/img/solo5-rumprun-slide.png" | relative_url}})

Solo5 support is built into these two layers. There are some drivers on the top
one and scheduling, time, and console primitives at the bottom one. Let's take a look at these layers 
in more detail.

#### The hypercall interface and implementation

The "hypercall" interface is the division between the netbsd kernel pieces and rumprun.
It looks like this:

```
rumpuser_malloc		// memory
rumpuser_putchar	// console
rumpuser_thread_*	// threading
rumpuser_getrandom	// random pool
rumpuser_mutex		// synchronization
rumpuser_rw_*		// synchronization
rumpuser_open		// block IO
rumpuser_bio		// block IO
rumpuser_clock_gettime	// time
rumpuser_clock_sleep	// time
```

This interface is mainly implemented by some architecture independent code,
at the cyan/blue "hypercall" implementation layer in the figure above.
The common code mainly lives at the `lib/` directory, in libraries like
`libbmk_core`.
The architecture dependent code is needed for I/O when the drivers are
not implemented in netbsd. For example, a regular `virtio_net` driver
can be used unmodified from netbsd. On the other hand, there is no `xen` network
driver in netbsd, so one had to be implemented in this layer. Another approach
would have been to add one into netbsd (but it has not been done for unknown
reasons). Block IO is optionally implemented by providing code for the `rumpuser_open`
and `rumpuser_bio` functions. Xen implements these in the `librumpxen_xendev` driver.
Additionally, network drivers can be implemented at this layer by registering
an `ifnet` device which points to functions for sending and reading packets.
What platform specific drivers to use is decided based on the argument passed
to `rumprun_bake`.

#### The BMK layer

The BMK layer implements bootstrap, PCI, interrupts control, clocks,
console, and random number generation. Let's describe this using
the scheduling event loop as an example.

#### The event loop

Rumprun, like most unikernels, implement a cooperative non-preemptive
scheduler which looks like this (copied from [this entry]({{ site.baseurl }}{% post_url 16-08-16-login-rump-kernels %})):

```
DISABLE INTERRUPTS
for (;;) {
	if (WORK_TO_DO)
		DO_WORK

	ENABLE_INTERRUPTS
	BLOCK_UNTIL_THERE_IS_AN_INTERRUPT // bmk_platform_cpu_block
	DISABLE INTERRUPTS
}
```

And, it's actually implemented at the `libbmk_core` library like this:

```
schedule() {
	...
	bmk_platform_splx
	for (;;) {
		curtime = bmk_platform_cpu_clock_monotonic();
		FOR thread in ALL_THREADS:
			if (thread->bt_wakeup_time <= curtime)
				bmk_sched_wake(thread);

		bmk_platform_splhigh
		bmk_platform_cpu_block
		bmk_platform_splx
	}
	...
}
```

Those `bmk_` functions are platform specific calls implemented for each platform
at `platform/hw/`, `platform/xen/`, and now `platform/solo5/`. In particular, the
functions implemented above are:

```
bmk_platform_splhigh		// enable interrupts
bmk_platform_splx		// disable interrupts
bmk_platform_cpu_block		// sleep until interrupt (or something happens)
bmk_platform_cpu_clock_monotonic // get monotonic time
```

It turns out that these functions can be trivially implemented in solo5/ukvm. There are no interrupts
in ukvm (the only interrupts are the ones handling faults), so `splhigh` and `splx` are `NOOP`s. `cpu_clock_monotonic` and `cpu_block` map directly
to solo5 like this (from `platform/solo5/kernel.c`):

```
bmk_time_t
bmk_platform_cpu_clock_monotonic(void)
{
        return solo5_clock_monotonic();
}

void bmk_platform_cpu_block(bmk_time_t until_ns)
{
        if (solo5_poll(until_ns)) // if there is pending work
                rumpcomp_ukvmif_receive();
}
```

There is an interesting detail on `cpu_block`, what to do if `poll` returns 1 (there's a pending packet).
If there is a pending packet, we have to tell that to whomever is waiting for the packet. Rumprun in
regular hardware has to do the same whenever there is an interrupt as a result of an arriving network packet,
so there is already a mechamism for notifying the TCP stack above (or whomever is waiting for the packet).
There are no interrupts in solo5, so all we have to do is use the same notification mechanism
when `solo5_poll` tells us that there is something received. Just for completeness,
the `rumpcomp_ukvmif_receive` function looks like this:

```
rumpcomp_ukvmif_receive()
{
	ifp = THE_ONLY_NIC_IN_SOLO5; // there is only one NIC supported in solo5 at the moment, so this is kind of simple
	solo5_net_read_sync(data);
	if_input(ifp, data);
}
```
 
It turns out that the other 2 unikernels that support solo5 do exactly the same on `solo5_poll`: read
the received packet and push it above to whomever is waiting for it. IncludeOS does it [like this](https://github.com/hioa-cs/IncludeOS/blob/master/src/platform/x86_solo5/os.cpp#L173); and mirageOS pushes the packet up with [this line](https://github.com/mirage/mirage-solo5/blob/master/lib/main.ml#L77).

### State of affairs

Solo5 is supported in rumprun as a prototype [here](https://github.com/ricarkol/rumprun/commits/solo5).
We currently don't have plans to upstream these changes to rumprun, but who knows.
Additionally, rumprun on solo5 were tested with some other applications like: node.js, python, and nginx.
All that is [here](https://github.com/ricarkol/rumprun-packages/tree/solo5).



