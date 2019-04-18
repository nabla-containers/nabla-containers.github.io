---
layout: post
title:  "br1dging the Gap II: Networking Complications"
date:   2019-04-18
tags: solo5 rumprun kubernetes cni oci
author: Brandon Lum
---

This is the second of several blog posts in the "`br1`dging the Gap" series! The series of posts will talk about the various gaps between what containers and their orchestration systems expect and what nabla containers expect.
This was a prominent theme in the writing of runnc, and we hope to be able to share a little about our design choices in runnc.
These set of posts relate to Nabla containers as well as other technologies that use a VM-like interface like VMs (i.e. [Katacontainers](https://katacontainers.io/)) and [Unikernels](https://en.wikipedia.org/wiki/Unikernel) in general.
We note that the content of the blog talks about the internal workings of [runnc](https://github.com/nabla-containers/runnc).

### Overview

In the previous [blog entry]({% post_url 2019-03-26-k8s-network %}), we talked about the networking configuration that we used to get unikernels running on a kubernetes cluster. In this blogpost, we talk about complications arising from running that configuration on a kubernetes cluster with a different networking configuration that gave us problems. The specific problem here was that pods of the same kubernetes cluster were not able to ping each other (even within the same
node).
As we will soon uncover in this post, these network complications are caused by configurations of subnetting, default gateways and the ARP protocol with certain kubernetes CNI configurations. We will dig deeper into the topology that we are dealing with as well as the steps we took to fix the network plumbing.

### Our previous setup

We will first take a look at what the network configuration of our previous kubernetes setup was - as well as the network plumbing that we performed. As a refresher, this is what we saw in the previous post:

![ukvm-network2]({{"/public/img/19-03-26-ukvm-network2.png" | relative_url }})

However, to be able to uncover the problem that we faced, it is easier to analyze our setup from the perspective of a L2/L3 network. Here is what the network would look like:

![ukvm-network-old1]({{"/public/img/19-04-05-ukvm-network-old1.png" | relative_url }})

We note that the diagram looks similar with the exception that we now see what is behind the "outside" network that the kubernetes networking plugin has created. We see that each `eth0` device of a pod is actually a veth pair, and thus can be seen as directly connected to the kubernetes bridge, `k8s_br0`. This bridge has attached onto it, a router. This router is to perform routing outside the subnets of the pod. In this case, since inter-pod communication is all on the same
subnet, it does not serve a purpose except for external communications. We also note that we have displayed MAC address which are important in addressing our issue. MAC addresses are abreviated to 6 hex for readability.

Let us now look at what our network plumbing looks like:

![ukvm-network-old2]({{"/public/img/19-04-05-ukvm-network-old2.png" | relative_url }})

As a recap, these are the steps we took to perform network plumbing:

1. Obtain the network configuration of `eth0`
2. Create a TAP device (requires `NET_ADMIN` capabilities), `tap100`
3. Remove the network configuration on `eth0`
4. Create a bridge and bridge the `tap100` to `eth0`
5. Run the unikernel using `tap100` with the network configuration originally obtained in `eth0`

Focusing on the right "node.js App" pod, we see that `k8s_br0` is connected directly to `br0` instead of `eth0`. When we set a device to be connected to the bridge, the flow of traffic to that device is instead redirected to the bridge by the linux kernel. Thus, resulting in such a network topology. 

We also note that `tap100` is not really a device but seen as a wire since what it does is propagate frames back and forth (like a hub - which is also essentially a highly connected wire). 

We note another interesting detail that we have this new interface `ukvmif`, which is a host in terms of networking (it has a IP, MAC, etc.). We note that in our previous setup, we only performed setting of the IP and default gateway in the unikernel. The MAC address is generated randomly. In our setup, we will see that all MACs with `(rng)` beside it are randomly generated. We assume that we choose a MAC [Organisationally Unique Identifier
(OUI)](https://en.wikipedia.org/wiki/Organizationally_unique_identifier) that will prevent collisions.

### Analyzing the ARP

![ukvm-network-old-arp]({{"/public/img/19-04-05-ukvm-network-old-arp.png" | relative_url }})

We note that going forward, we will be analyzing how packets are routed on [layer 2](https://en.wikipedia.org/wiki/Data_link_layer). As a refresher, we note that a frame looks like:

Frame = ```| Frame header = src + dest MAC, etc. | IP Packet | Frame footer = checksum |```

Bridges are layer 2 devices and only forward based on layer 2 information. More specifically, it observes the destination MAC address on the frame and routes it based on its knowledge of the ethernet segments. We note an additional point that src MAC addresses are rewritten on each hop, but src rewriting is not relevant for our discussion.

Given that a host has to know how to construct a frame, a host requires some sort of reference to what MAC address it should send a packet to. This information is shared through the [Address Resolution Protocol (ARP)](https://en.wikipedia.org/wiki/Address_Resolution_Protocol). A very brief overview of how it works, is that each host maintains a ARP table which maps IP addresses to MAC addresses. If a host wants to construct a frame for an IP packet destined for an IP address,
i.e. 172.17.0.5, it first checks its ARP table to see if it knows the MAC address of this IP. If an entry is present, it constructs a frame with the associated MAC address, else, it sends out an ARP-Request asking who-is 172.17.0.5 please tell me on its subnet. The host itself, or someone with that knowledge will then respond with the approriate MAC address.

Thus, we see the setup above showing the ARP tables of each host. We note that the router has the ARP entries either hardcoded while setup of the container or during pod creation time from communication with the interface.

![ukvm-network-old-send]({{"/public/img/19-04-05-ukvm-network-old-send.png" | relative_url }})

Here we see the connection that we are trying to make from our python application (172.17.0.4/16) to our node.js unikernel (172.17.0.5/16). Because the two addresses are on the same subnet, the default gateway is not involved. 

1. The `eth0` interface first checks if it has an entry for 172.17.0.5 in its ARP table. 
2. It is not present since it has not made a connection to `172.17.0.5` before, and so it sends out an ARP request for 172.17.0.5
3. The ARP request gets propagated around the subnet to devices in our subnet, including `eth0` and `ukvmif` in the node.js pod 
4. `eth0` discards the ARP request since it does not have that IP, but the unikernel `ukvmif` returns with an ARP respone with the MAC `ab:cd:e2`
5. The `eth0` interface on the python app then updates its ARP table and sends the constructed frame with destination MAC `ab:cd:e2`, which successfully gets routed to the unikernel.


### Our new network configuration

![ukvm-network-new]({{"/public/img/19-04-05-ukvm-network-new.png" | relative_url }})

In the new kubernetes cluster that we deployed our unikernels, the network configuration provided by the CNI plugin was slightly different. Instead of pods being given IPs on the same subnet. They were given `/32` IPs, with a default gateway of `169.254.1.1`. The default gateway may seem odd at first, since it is not on the same network as the IP assigned. However, a technique called [proxy ARP](https://en.wikipedia.org/wiki/Proxy_ARP) is used. The ARP proxy is on the same ethernet
segment (on `k8s_br0`) and is able to respond to ARP requests for the IP `169.254.1.1` to the actual MAC of the default gateway.

### The problem 

![ukvm-network-new-send-broken]({{"/public/img/19-04-05-ukvm-network-new-send-broken.png" | relative_url }})

Let's try the connection again! Here we see the connection that we are trying to make from our python application (172.17.0.4/32) to our node.js unikernel (172.17.0.5/32). 

However, since the addresses are on a different subnet. The connection process is slightly different.

1. The `eth0` interface detects that the destination IP is on a different subnet, so it destines the packet for the default gateway. 
2. The `eth0` interface first checks if it has an entry for `169.254.1.1` in its ARP table. 
3. The MAC for `169.254.1.1` is present and does it sends out a frame to `cc:cc:c1`. 
4. The router receives this packet and checks its ARP table to find the destination for `172.17.0.5`. 
5. It has an ARP entry and sends a frame to `bb:bb:b1` since it has an entry from setting up the configuration.
6. The frame gets forwarded through but the bridge `br0` on the node.js pod forwards this to `eth0` instead, since 
7. `eth0` discards the frame as it has no use of it.

The problem here is that the ARP table in the router is not updated with the new MAC oddress of `ukvmif`. We will perform a fix by telling our unikernel to adopt the MAC address of the initially assigned MAC address of the `eth0` interface.

![ukvm-network-new-send-fixed]({{"/public/img/19-04-05-ukvm-network-new-send-fixed.png" | relative_url }})

With the re-assignment of the MAC address, we can now see that the packet is routed correctly to `ukvmif`. And our unikernel is able to receive the request!

### Done with Networks! Filesystems are next!

This post wraps up the topic on networks in this series of blog posts. Next up we'll be talking about bridging the gap between filesystems and the block device interface! Stay tuned!
