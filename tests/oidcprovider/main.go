// Author: yunnuo <ymz@ebox.vip>
// Description: Loopback-only test IdP executable for real browser acceptance.
package main

import (
	"flag"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/yunnuo/unicore/tests/oidcfixture"
)

func main() {
	address := flag.String("listen", "127.0.0.1:0", "literal loopback address")
	flag.Parse()
	host, _, err := net.SplitHostPort(*address)
	ip := net.ParseIP(host)
	if err != nil || ip == nil || !ip.IsLoopback() {
		log.Fatal("test provider requires loopback")
	}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		log.Fatal(err)
	}
	provider := oidcfixture.New()
	provider.URL = "http://" + listener.Addr().String()
	log.Print(provider.URL)
	server := &http.Server{Handler: provider, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(server.Serve(listener))
}
