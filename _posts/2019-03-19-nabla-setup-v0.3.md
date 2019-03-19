---
layout: post
title: Runnc Release v0.3 and Updated Setup
date: 2019-03-19
author: lumjjb
description: Nabla has just released v0.3!
---


Nabla has just released v0.3! This has some implications for users. Mainly that images used have to adapt changes from the changes to solo5. This is largely due to the moving of our experimental features to upstream solo5! Along those lines, we've had some work done by the folks at [@CloudKernels](https://twitter.com/CloudKernels) to provide support for `aarch64` coming to a nabla near you! We have some ideas floating around for `runnc` v0.4, so we are looking forward to what's to come!

We would like to thank everyone for contributing to the several features since v0.2!
- Update to new Solo5 spt (@ananos, @ricarkol)
- `aarch64` support (@ananos, @papazof)
- Move runnc-cont inside runnc (@zhuangqh)
- Pass memory requirement to runnc, `--oom-score-adj` (@InTheCloudDan)

This is the end of our announcement, and the rest of the blog is an updated version of the original setup blog for v0.3.

---

## Original blog post on "Running a Nabla Container" modified for v0.3

NOTE: This is an updated version using `runnc` v0.3 of the [original post]({% post_url 2018-06-28-nabla-setup %}).

Earlier, we introduced [Nabla Containers]({{'/' | relative_url}}). In this article we will show how you can get started with Nabla-containers! We will go through the build and installation process, and get you started on running your first nabla container - in 3 simple steps! In the following articles, we will show how you can create your own nabla containerized `node.js` and `python` applications!

This article assumes a linux machine with golang and docker. But if you don't have that, we have provided instructions in the appendix to create a ubuntu VM as our development machine (but of course, you don't have to!).

## Step 1: Let's build and install runnc

`runnc` is the runtime for nabla containers. It serves the same purpose of `runc` for standard linux containers. Before we are able to run nabla containers, we need to have it installed.

First, we get the go repository:

```
# Set our GOPATH (If you don't already have one)
ubuntu@ubuntu-xenial:~$ mkdir -p ~/go
ubuntu@ubuntu-xenial:~$ export GOPATH=~/go
ubuntu@ubuntu-xenial:~$ go get github.com/nabla-containers/runnc
ubuntu@ubuntu-xenial:~$ cd ${GOPATH}/src/github.com/nabla-containers/runnc
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ ls
AUTHORS          Dockerfile.build  Makefile   README.md   ... <TRUNCATED>...
```

Next, we go ahead to build the binaries needed. `runnc` has a containerized build which has all the build dependencies in a docker image! So building the binaries should be as easy as a `make container-build` (assuming `docker` is installed). If your dev environment doesn't have docker or is already a docker container, you may follow the directions on the README (https://github.com/nabla-containers/runnc) in runnc.

```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ make container-build
sudo docker build . -f Dockerfile.build -t runnc-build
Sending build context to Docker daemon 2.128 MB
Step 1/6 : FROM golang:1.9
1.9: Pulling from library/golang
cc1a78bfd46b: Pull complete
d2c05365ee2a: Pull complete
231cb0e216d3: Pull complete
3d2aa70286b8: Pull complete
d5d81a1460e2: Pull complete
7e302df1742f: Pull complete
4074f65ff6c3: Pull complete
0f682b69172b: Pull complete
Digest: sha256:b5585b142f15c50eff6ece8044bdf594e883681d83bebec2cff4484d827fcc79
Status: Downloaded newer image for golang:1.9
 ---> b2124311f489
Step 2/6 : RUN go get -u github.com/golang/dep/cmd/dep
... <TRUNCATED>...
make[3]: Leaving directory '/go/src/github.com/nabla-containers/runnc/solo5/tests/test_quiet'
make[2]: Leaving directory '/go/src/github.com/nabla-containers/runnc/solo5/tests'
make[1]: Leaving directory '/go/src/github.com/nabla-containers/runnc/solo5'
install -m 775 -D solo5/ukvm/ukvm-bin build/nabla-run
```
We should see that the following files exist:

```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ ls -l build/
total 7268
-rwxrwxr-x 1 root root  170960 Jun 22 14:23 nabla-run
-rwxr-xr-x 1 root root 2696096 Jun 22 14:23 runnc
```

Now let's install `runnc`, using `make container-install`.
```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ make container-install
sudo docker build . -f Dockerfile.build -t runnc-build
Sending build context to Docker daemon 22.07 MB
... <TRUNCATED> ...
sudo hack/copy_binaries.sh
build/runnc
build/nabla-run
```

We should verify that the following files exist:

```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ ls -l /usr/local/bin
total 7268
-rwxr-xr-x 1 root root  170960 Jun 22 14:33 nabla-run
-rwxr-xr-x 1 root root 2696096 Jun 22 14:33 runnc
```

## Step 2: Installing the runtime for docker

Before we go ahead, we need to install some runtime pre-requisites.
```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ sudo apt install -y genisoimage
... <TRUNCATED>...
```

Finally, we go ahead to configure docker to use our runtime. This can be done by editing the `/etc/docker/daemon.json` file. By default, there is not configuration, so we just add the file.

NOTE: if you have custom runtimes already installed, we recommend modifying the file yourself.

```
ubuntu@ubuntu-xenial:~/go/src/github.com/nabla-containers/runnc$ cat /etc/docker/daemon.json
{
    "runtimes": {
        "runnc": {
                "path": "/usr/local/bin/runnc"
        }
    }
}
```

Finally, we just restart the docker daemon to apply the new configuration:

```
sudo systemctl restart docker
```


## Step 3: Creating our first nabla container
Let's go ahead to start our first nabla container:
```
$ sudo docker run --rm -p 8080:8080 --runtime=runnc nablact/node-express-nabla:v0.3 &
Unable to find image 'nablact/node-express:v0.2' locally
latest: Pulling from nablact/node-express
03e1855d4f31: Already exists
a3ed95caeb02: Already exists
9269ba3950bb: Already exists
6ecee6444751: Already exists
7a0c192d4d25: Already exists
9e9f27c61394: Already exists
f20b85b68b8c: Already exists
a0cf1d52e01e: Pull complete
5b1ea06a3d22: Pull complete
37f52a1e80e8: Pull complete
ac16621c4c84: Pull complete
Digest: sha256:e077d441aa67bc74d982af27e35ed0f40270e7fd4747cac9ce9b71d6bf5f83fb
Status: Downloaded newer image for nablact/node-express:v0.3
... <TRUNCATED> ...
[/nabla-run --net=tap100 --disk=/rootfs.iso /node.nabla {"env":"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","env":"HOSTNAME=0f9813ba8dba","cmdline":"/node.nabla /home/node/app/app.js","net":{"if":"ukvmif0","cloner":"True","type":"inet","method":"static","addr":"172.17.0.2","mask":"16","gw":"172.17.0.1"},"blk":{"source":"etfs","path":"/dev/ld0a","fstype":"blk","mountpoint":"/"},"cwd":"/"}]
... <TRUNCATED> ...
Listening on port 8080
```

We can then access this on our localhost:

```
$ curl localhost:8080
Nabla!
```

Stay tuned for the next article on how to create `node.js` and  `python` nabla containerized applications.


## Appendix: Setting up a Linux VM with golang and docker.

Note that if you want to perform a more advanced setup (i.e. with k8s - you may need more memory and disk than the default.

We set up a dev VM using vagrant:

```
$ vagrant init ubuntu/xenial64
A `Vagrantfile` has been placed in this directory. You are now
ready to `vagrant up` your first virtual environment! Please read
the comments in the Vagrantfile as well as documentation on
`vagrantup.com` for more information on using Vagrant.
$ vagrant up
Bringing machine 'default' up with 'virtualbox' provider...
==> default: Importing base box 'ubuntu/xenial64'...
... <TRUNCATED>...
$ vagrant ssh
ubuntu@ubuntu-xenial:~$ sudo apt update
... <TRUNCATED>...
# TO install docker, we use instructions from:
# https://docs.docker.com/install/linux/docker-ce/ubuntu/
# for the most updated

# TO install golang, we use instructions from:
# https://golang.org/doc/install#install
# for the most updated

```
