// Author: yunnuo <ymz@ebox.vip>
// Description: Isolated loopback SMTP fixture; captures only synthetic test messages.
package testutil

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"net"
	"net/textproto"
	"strings"
	"sync"
)

type SMTP struct {
	Listener    net.Listener
	tlsConfig   *tls.Config
	mu          sync.Mutex
	messages    []string
	failures    int
	connections map[net.Conn]bool
	wait        sync.WaitGroup
}

func StartSMTP() (*SMTP, error) { return StartSecureSMTP("plain", nil) }
func StartSecureSMTP(mode string, config *tls.Config) (*SMTP, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	if mode == "tls" {
		listener = tls.NewListener(listener, config)
	}
	s := &SMTP{Listener: listener, connections: map[net.Conn]bool{}}
	if mode == "starttls" {
		s.tlsConfig = config
	}
	s.wait.Add(1)
	go func() {
		defer s.wait.Done()
		for {
			connection, err := listener.Accept()
			if err != nil {
				return
			}
			s.mu.Lock()
			s.connections[connection] = true
			s.mu.Unlock()
			s.wait.Add(1)
			go s.serve(connection)
		}
	}()
	return s, nil
}
func (s *SMTP) serve(connection net.Conn) {
	defer s.wait.Done()
	tracked := connection
	defer connection.Close()
	defer func() { s.mu.Lock(); delete(s.connections, tracked); s.mu.Unlock() }()
	reader := textproto.NewReader(bufio.NewReader(connection))
	writer := bufio.NewWriter(connection)
	reply := func(value string) { _, _ = fmt.Fprint(writer, value+"\r\n"); _ = writer.Flush() }
	reply("220 localhost SMTP test")
	for {
		line, err := reader.ReadLine()
		if err != nil {
			return
		}
		command := strings.ToUpper(strings.Fields(line)[0])
		switch command {
		case "EHLO":
			if s.tlsConfig != nil {
				reply("250-localhost\r\n250-STARTTLS\r\n250 AUTH PLAIN")
			} else {
				reply("250-localhost\r\n250 AUTH PLAIN")
			}
		case "STARTTLS":
			if s.tlsConfig == nil {
				reply("500 Unsupported")
				continue
			}
			reply("220 Ready for TLS")
			secure := tls.Server(connection, s.tlsConfig)
			if err = secure.Handshake(); err != nil {
				return
			}
			connection = secure
			reader = textproto.NewReader(bufio.NewReader(connection))
			writer = bufio.NewWriter(connection)
		case "AUTH":
			reply("235 Authentication succeeded")
		case "HELO", "MAIL", "RCPT", "RSET", "NOOP":
			reply("250 OK")
		case "DATA":
			reply("354 Continue")
			body, err := reader.ReadDotBytes()
			if err != nil {
				return
			}
			s.mu.Lock()
			fail := s.failures > 0
			if fail {
				s.failures--
			} else {
				s.messages = append(s.messages, string(body))
			}
			s.mu.Unlock()
			if fail {
				reply("451 Temporary test failure")
			} else {
				reply("250 Accepted")
			}
		case "QUIT":
			reply("221 Bye")
			return
		default:
			reply("500 Unsupported")
		}
	}
}
func (s *SMTP) Messages() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string{}, s.messages...)
}
func (s *SMTP) FailNext(count int) { s.mu.Lock(); defer s.mu.Unlock(); s.failures = count }
func (s *SMTP) Close() {
	_ = s.Listener.Close()
	s.mu.Lock()
	for connection := range s.connections {
		_ = connection.Close()
	}
	s.mu.Unlock()
	s.wait.Wait()
}
