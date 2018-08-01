---
layout: default
title: "Nabla containers: a new approach to container isolation"
---

# Nabla containers: a new approach to container isolation

Despite all of the advantages that have resulted in an industry-wide
shift towards containers, containers have not been accepted as
isolated sandboxes, which is crucial for container-native clouds.  We
introduce *nabla containers*, a new type of container designed for 
strong isolation on a host.

Nabla containers achieve isolation by adopting a strategy of attack
surface reduction to the host.  A visualization of this approach
appears in this figure:

![nabla-containers]({{"public/img/nabla-containers.png" | relative_url}})

A containerized application can avoid making a Linux system call if it
links to a library OS component that implements the system call
functionality.  Nabla containers use library OS (aka unikernel)
techniques, specifically those from the [Solo5
project](https://github.com/Solo5/solo5), to avoid system calls and
thereby reduce the attack surface.  Nabla containers only use 7
system calls; all others are blocked via a Linux seccomp policy.  An
overview of the internals of a nabla container appears in this figure:

![nabla-internals]({{"public/img/nabla-internals.png" | relative_url}})

For the curious, here are the allowed syscalls: `read`, `write`,
`exit_group`, `clock_gettime`, `ppoll`, `pwrite64`, and
`pread64`. They are restricted to specific file descriptors (already
opened before enabling seccomp). They originate from the hypercall
implementations of the `ukvm` unikernel monitor.[^1] Check out [the
code](https://github.com/nabla-containers/solo5/blob/ukvm-linux-seccomp/ukvm/ukvm_hv_linux.c#L53-L106)
for more specifics.


### Are nabla containers really more isolated?

The isolation in nabla containers comes from limiting access to the
host kernel via the blocking of system calls.  We have measured
exactly how much access to the kernel common applications exhibit with
nabla containers and standard containers by measuring the number of
system calls containerized applications make and correspondingly how
many kernel functions they access.  This graph summarizes results for
a few applications:

![nabla-isolation]({{"public/img/nabla-isolation.png" | relative_url}})

Further measurements and results and scripts to reproduce them reside
in the
[nabla-measurements](https://github.com/nabla-containers/nabla-measurements)
repository.

### Repository overview

More information appears in each of the individual repositories related to 
nabla containers. In addition, this 
[article]({% post_url 2018-06-28-nabla-setup %}) steps you through the 
process of running your first nabla container:

- [runnc](https://github.com/nabla-containers/runnc): is the
  OCI-interfacing container runtime for nabla containers.  Start here
  to run nabla containers!

- [nabla-demo-apps](https://github.com/nabla-containers/nabla-demo-apps):
  shows how to build sample applications containerized as nabla
  containers.  Helpful to see how to containerize your own application
  by building from an existing nabla base Docker image.

- [nabla-measurements](https://github.com/nabla-containers/nabla-measurements):
  contains isolation measurements of nabla containers with comparisons
  to standard containers and other container isolation approaches,
  such as kata containers and gvisor.

If you want to go deeper, check out the following repositories:

- [nabla-base-build](https://github.com/nabla-containers/nabla-base-build):
  shows how to build the nabla base Docker images.  Helpful for seeing
  how to use rumprun to port an application or runtime as a new nabla base.

- [solo5](https://github.com/nabla-containers/solo5): A temporary branch of
  Solo5 (http://github.com/Solo5/solo5) that contains "nabla-run", a
  seccomp-based tender for Solo5. We are working on adding this new tender
  changes upstream.

- [rumprun](https://github.com/nabla-containers/rumprun): a fork of
  Rumprun that enables rumprun to run on the Solo5 interface.

- [rumprun-packages](https://github.com/nabla-containers/rumprun-packages):
  a fork of rumprun-packages that contains targets to run on Solo5.

### Limitations

The main limitation is that the Nabla runtime (runnc) only supports
images built for nabla (see
[nabla-base-build](https://github.com/nabla-containers/nabla-base-build)). Other
limitations are listed
[here](https://github.com/nabla-containers/runnc#limitations).


[^1]: For more information about `ukvm`, check out our HotCloud '16
      paper [Unikernel Monitors: Extending Minimalism Outside of the
      Box](https://www.usenix.org/conference/hotcloud16/workshop-program/presentation/williams)
      or the [Solo5](http://github.com/Solo5/solo5) project on Github.
